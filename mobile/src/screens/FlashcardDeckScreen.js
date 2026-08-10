import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  PanResponder,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { fetchPlacards, toggleMastered, resyncCards, getResyncStatus, syncNow } from '../api';
import FlipCard from '../components/FlipCard';
import CodeModal from '../components/CodeModal';
import { C, fonts, shuffle, studyOrder } from '../theme';

const SWIPE_Y = 60;
const HINT_KEY = '@leetplacards_gesture_hint_seen';

function ResyncBanner({ progress }) {
  if (!progress || progress.status === 'idle' || progress.status === 'done') return null;
  const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  return (
    <View style={styles.resyncBanner}>
      <Text style={styles.resyncText}>
        {progress.status === 'error'
          ? 'Resync failed'
          : `Syncing: ${progress.completed}/${progress.total} cards`}
        {progress.current ? ` — ${progress.current}` : ''}
      </Text>
      <View style={styles.resyncTrack}>
        <View style={[styles.resyncFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function GestureHint({ visible, onDismiss }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <Pressable style={styles.hintOverlay} onPress={onDismiss}>
        <View style={styles.hintCard}>
          <Text style={styles.hintTitle}>How to study</Text>
          <Text style={styles.hintLine}>↔  Swipe right / left to flip</Text>
          <Text style={styles.hintLine}>↕  Swipe up / down for next card</Text>
          <Text style={styles.hintLine}>✓  Mark mastered when you know it</Text>
          <TouchableOpacity style={styles.hintBtn} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.hintBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

function SessionDone({ stats, onAgain, onExit }) {
  return (
    <View style={styles.center}>
      <Text style={styles.sessionEmoji}>Done</Text>
      <Text style={styles.sessionTitle}>Session complete</Text>
      <Text style={styles.sessionSub}>
        Reviewed {stats.total} cards · marked {stats.mastered} mastered
      </Text>
      <TouchableOpacity style={styles.pillBtn} onPress={onAgain} activeOpacity={0.8}>
        <Text style={styles.pillBtnText}>Study again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkBtn} onPress={onExit}>
        <Text style={styles.linkBtnText}>Back to full deck</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function FlashcardDeckScreen({ navigation }) {
  const [allCards, setAllCards] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [codeVisible, setCodeVisible] = useState(false);
  const [resyncProgress, setResyncProgress] = useState(null);
  const [hideMastered, setHideMastered] = useState(false);
  const [sessionMode, setSessionMode] = useState(false);
  const [sessionDone, setSessionDone] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pollRef = useRef(null);

  const rebuildDeck = useCallback(
    (source, hide, session) => {
      let deck = studyOrder(source, { hideMastered: hide });
      if (session) {
        deck = shuffle(source.filter((c) => !c.mastered)).slice(0, 10);
        if (deck.length === 0) deck = shuffle(source).slice(0, Math.min(10, source.length));
      }
      setCards(deck);
      setIdx(0);
      setSessionDone(null);
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlacards(true);
      setAllCards(data);
      rebuildDeck(data, hideMastered, sessionMode);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [hideMastered, sessionMode, rebuildDeck]);

  useEffect(() => {
    load();
    syncNow().catch(() => {});
    AsyncStorage.getItem(HINT_KEY).then((v) => {
      if (!v) setShowHint(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissHint = async () => {
    setShowHint(false);
    await AsyncStorage.setItem(HINT_KEY, '1');
  };

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await getResyncStatus();
        setResyncProgress(s);
        if (s.status === 'done' || s.status === 'error' || s.status === 'idle') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (s.status === 'done' && s.total > 0) await load();
          if (s.status === 'error') {
            Alert.alert('Resync Error', s.current || 'Something went wrong.');
          }
          setTimeout(() => setResyncProgress(null), 3000);
        }
      } catch (_) {}
    }, 2500);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getResyncStatus()
      .then((s) => {
        if (cancelled || s.status !== 'running') return;
        setResyncProgress(s);
        startPolling();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [startPolling]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  const card = cards[idx] || null;
  const total = cards.length;
  const idxRef = useRef(idx);
  const totalRef = useRef(total);
  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  const slideTo = useCallback(
    (to, direction) => {
      Haptics.selectionAsync().catch(() => {});
      const out = direction === 'up' ? -40 : 40;
      Animated.timing(slideAnim, {
        toValue: out,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setIdx(to);
        slideAnim.setValue(direction === 'up' ? 40 : -40);
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }).start();
      });
    },
    [slideAnim]
  );

  const next = useCallback(() => {
    if (idx >= total - 1) {
      if (sessionMode) {
        const mastered = cards.filter((c) => c.mastered).length;
        setSessionDone({ total: cards.length, mastered });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      return;
    }
    slideTo(idx + 1, 'up');
  }, [idx, total, slideTo, sessionMode, cards]);

  const prev = useCallback(() => {
    if (idx > 0) slideTo(idx - 1, 'down');
  }, [idx, slideTo]);

  const nextRef = useRef(next);
  const prevRef = useRef(prev);
  const sessionRef = useRef(sessionMode);
  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
    sessionRef.current = sessionMode;
  }, [next, prev, sessionMode]);

  const deckPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dy) > 15 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        const ci = idxRef.current;
        const t = totalRef.current;
        if (g.dy < -SWIPE_Y && ci < t - 1) nextRef.current();
        else if (g.dy > SWIPE_Y && ci > 0) prevRef.current();
        else if (g.dy < -SWIPE_Y && ci >= t - 1 && sessionRef.current) nextRef.current();
      },
    })
  ).current;

  const handleMastered = async () => {
    if (!card) return;
    try {
      const res = await toggleMastered(card.id);
      Haptics.notificationAsync(
        res.mastered
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      setCards((p) => p.map((c, i) => (i === idx ? { ...c, mastered: res.mastered } : c)));
      setAllCards((p) => p.map((c) => (c.id === card.id ? { ...c, mastered: res.mastered } : c)));
    } catch (_) {}
  };

  const toggleHideMastered = () => {
    const nextHide = !hideMastered;
    setHideMastered(nextHide);
    setSessionMode(false);
    rebuildDeck(allCards, nextHide, false);
  };

  const startSession = () => {
    const unmastered = allCards.filter((c) => !c.mastered);
    if (allCards.length === 0) return;
    if (unmastered.length === 0) {
      Alert.alert('All mastered', 'Every card is marked mastered. Shuffle the full deck instead?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Study 10 anyway',
          onPress: () => {
            setSessionMode(true);
            setHideMastered(false);
            rebuildDeck(allCards, false, true);
          },
        },
      ]);
      return;
    }
    setSessionMode(true);
    setHideMastered(false);
    rebuildDeck(allCards, false, true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const handleResync = (force = false) => {
    const title = force ? 'Full Resync' : 'Smart Resync';
    const msg = force
      ? 'Re-fetch ALL problems from LeetCode and re-analyze all code. Runs in the background.'
      : 'Only re-process cards missing descriptions or approaches.';
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: force ? 'Full Resync' : 'Resync',
        onPress: async () => {
          try {
            const r = await resyncCards(force);
            if (r.status === 'already_running') {
              Alert.alert('In Progress', `Already syncing: ${r.completed}/${r.total} done.`);
            } else if (r.status === 'done') {
              Alert.alert('All Good', r.message || 'All cards already have content.');
            } else {
              setResyncProgress({
                status: 'running',
                total: r.cards_to_process || 0,
                completed: 0,
                current: '',
              });
              startPolling();
            }
          } catch (e) {
            Alert.alert('Error', e.message || 'Resync failed');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.centerText}>Loading your deck...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[styles.centerText, { color: C.hard, marginBottom: 16 }]}>{error}</Text>
        <TouchableOpacity style={styles.pillBtn} onPress={load}>
          <Text style={styles.pillBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sessionDone) {
    return (
      <SessionDone
        stats={sessionDone}
        onAgain={() => {
          setSessionMode(true);
          rebuildDeck(allCards, false, true);
        }}
        onExit={() => {
          setSessionMode(false);
          rebuildDeck(allCards, hideMastered, false);
        }}
      />
    );
  }

  if (!card) {
    return (
      <View style={styles.center}>
        <Text style={[styles.centerText, { fontSize: 18, fontFamily: fonts.bold, color: C.dark }]}>
          {hideMastered ? 'No unmastered cards' : 'No Cards Yet'}
        </Text>
        <Text style={[styles.centerText, { marginTop: 4 }]}>
          {hideMastered
            ? 'Turn off “Hide mastered” or push more solutions.'
            : 'Push LeetCode solutions to your connected repo.'}
        </Text>
        {hideMastered ? (
          <TouchableOpacity style={[styles.pillBtn, { marginTop: 20 }]} onPress={toggleHideMastered}>
            <Text style={styles.pillBtnText}>Show all cards</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const progress = total > 0 ? (idx + 1) / total : 0;
  const isResyncing = resyncProgress && resyncProgress.status === 'running';
  const masteredCount = allCards.filter((c) => c.mastered).length;

  return (
    <View style={styles.root} {...deckPan.panHandlers}>
      <GestureHint visible={showHint} onDismiss={dismissHint} />
      <CodeModal visible={codeVisible} code={card.code} onClose={() => setCodeVisible(false)} />

      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>LeetPlacards</Text>
          <Text style={styles.counter}>
            {sessionMode ? `Session ${idx + 1}/${total}` : `${idx + 1} / ${total}`}
            {!sessionMode ? ` · ${masteredCount} mastered` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => navigation.navigate('PlacardList')}
          activeOpacity={0.7}
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <ResyncBanner progress={resyncProgress} />

      <Animated.View
        style={[styles.deck, { transform: [{ translateY: slideAnim }] }]}
      >
        <FlipCard card={card} onShowCode={() => setCodeVisible(true)} />
      </Animated.View>

      <View style={styles.controls}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, idx === 0 && styles.dim]}
            onPress={prev}
            disabled={idx === 0}
          >
            <Text style={styles.navLabel}>‹ Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.masteredBtn, card.mastered && styles.masteredBtnOn]}
            onPress={handleMastered}
          >
            <Text style={[styles.masteredLabel, card.mastered && styles.masteredLabelOn]}>
              {card.mastered ? '✓ Mastered' : 'Mark Mastered'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, idx >= total - 1 && !sessionMode && styles.dim]}
            onPress={next}
            disabled={idx >= total - 1 && !sessionMode}
          >
            <Text style={styles.navLabel}>{idx >= total - 1 && sessionMode ? 'Finish' : 'Next ›'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actRow}>
          <TouchableOpacity
            style={[styles.actBtn, sessionMode && styles.actBtnOn]}
            onPress={startSession}
          >
            <Text style={[styles.actLabel, sessionMode && styles.actLabelOn]}>Study 10</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actBtn, hideMastered && styles.actBtnOn]}
            onPress={toggleHideMastered}
          >
            <Text style={[styles.actLabel, hideMastered && styles.actLabelOn]}>
              {hideMastered ? 'Show all' : 'Hide mastered'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actBtn}
            onPress={() => {
              setSessionMode(false);
              rebuildDeck(allCards, hideMastered, false);
            }}
          >
            <Text style={styles.actLabel}>Shuffle</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actRow}>
          <TouchableOpacity
            style={[styles.actBtn, isResyncing && { opacity: 0.5 }]}
            onPress={() => handleResync(false)}
            disabled={isResyncing}
          >
            <Text style={styles.actLabel}>{isResyncing ? 'Syncing...' : 'Resync'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actBtn, isResyncing && { opacity: 0.5 }]}
            onPress={() => handleResync(true)}
            disabled={isResyncing}
          >
            <Text style={styles.actLabel}>Full Resync</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 50 },
  center: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  centerText: {
    color: C.mid,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  pillBtn: {
    backgroundColor: C.primary,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginTop: 8,
  },
  pillBtnText: { color: C.white, fontFamily: fonts.semiBold, fontSize: 14 },
  linkBtn: { marginTop: 16, padding: 8 },
  linkBtnText: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 14 },
  sessionEmoji: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  sessionTitle: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: C.dark,
    marginBottom: 8,
  },
  sessionSub: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: C.mid,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  appName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.dark,
    letterSpacing: -0.3,
  },
  counter: { fontSize: 12, color: C.light, marginTop: 1, fontFamily: fonts.medium },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.white,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  menuIcon: { fontSize: 16, color: C.mid },

  progressTrack: {
    height: 3,
    backgroundColor: C.border,
    marginHorizontal: 20,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },

  resyncBanner: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: C.primarySoft,
    borderRadius: 8,
    padding: 10,
  },
  resyncText: {
    fontSize: 12,
    color: C.primary,
    fontFamily: fonts.semiBold,
    marginBottom: 6,
  },
  resyncTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  resyncFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },

  deck: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  controls: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  navBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: C.white,
    elevation: 2,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  navLabel: { color: C.dark, fontFamily: fonts.semiBold, fontSize: 13 },
  dim: { opacity: 0.3 },
  masteredBtn: {
    flex: 1,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  masteredBtnOn: { backgroundColor: C.successBg, borderColor: C.success },
  masteredLabel: { color: C.mid, fontFamily: fonts.semiBold, fontSize: 13 },
  masteredLabelOn: { color: C.success },
  actRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  actBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
  },
  actBtnOn: { backgroundColor: C.primary },
  actLabel: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 12 },
  actLabelOn: { color: C.white },

  hintOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  hintCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
  },
  hintTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.dark,
    marginBottom: 16,
    textAlign: 'center',
  },
  hintLine: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: C.mid,
    lineHeight: 28,
    marginBottom: 4,
  },
  hintBtn: {
    marginTop: 20,
    backgroundColor: C.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  hintBtnText: { color: C.white, fontFamily: fonts.semiBold, fontSize: 15 },
});
