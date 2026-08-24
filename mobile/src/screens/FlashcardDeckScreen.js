import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { fetchPlacards, toggleMastered, resyncCards, getResyncStatus, syncNow, setAuthToken } from '../api';
import { useAuth } from '../context/AuthContext';
import FlipCard from '../components/FlipCard';
import CodeModal from '../components/CodeModal';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import AppButton from '../components/AppButton';
import StatusView from '../components/StatusView';
import MasteredButton from '../components/MasteredButton';
import { C, fonts, studyOrder } from '../theme';

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
          <Text style={styles.hintLine}>Read the problem, then swipe right to flip.</Text>
          <Text style={styles.hintLine}>The back names the pattern, why it fits, and the approach.</Text>
          <Text style={styles.hintLine}>Swipe up or tap Next for the next card.</Text>
          <AppButton title="Got it" onPress={onDismiss} style={{ marginTop: 16 }} />
        </View>
      </Pressable>
    </Modal>
  );
}

export default function FlashcardDeckScreen({ navigation }) {
  const { logout } = useAuth();
  const [allCards, setAllCards] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [codeVisible, setCodeVisible] = useState(false);
  const [resyncProgress, setResyncProgress] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pollRef = useRef(null);

  const rebuildDeck = useCallback((source) => {
    setCards(studyOrder(source));
    setIdx(0);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlacards(true);
      setAllCards(data);
      rebuildDeck(data);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [rebuildDeck]);

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
    if (idx >= total - 1) return;
    slideTo(idx + 1, 'up');
  }, [idx, total, slideTo]);

  const prev = useCallback(() => {
    if (idx > 0) slideTo(idx - 1, 'down');
  }, [idx, slideTo]);

  const nextRef = useRef(next);
  const prevRef = useRef(prev);
  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
  }, [next, prev]);

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

  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <TouchableOpacity onPress={() => navigation.navigate('ConnectRepo')} hitSlop={8}>
        <Text style={{ color: C.primary, fontFamily: fonts.semiBold, fontSize: 14 }}>Change repo</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          Alert.alert('Log out', 'You can then sign in with a different GitHub account.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Log out',
              style: 'destructive',
              onPress: async () => {
                setAuthToken(null);
                await logout();
              },
            },
          ]);
        }}
        hitSlop={8}
      >
        <Text style={{ color: C.primary, fontFamily: fonts.semiBold, fontSize: 14 }}>Log out</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Study" subtitle="Loading" right={headerRight} />
        <StatusView loading message="Loading your deck…" />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ScreenHeader title="Study" subtitle="Couldn’t load" right={headerRight} />
        <StatusView error={error} onRetry={load} />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen>
        <ScreenHeader title="Study" subtitle="0 cards" right={headerRight} />
        <StatusView
          title="No cards yet"
          message="Push LeetCode solutions to your connected repo."
        />
      </Screen>
    );
  }

  const progress = total > 0 ? (idx + 1) / total : 0;
  const isResyncing = resyncProgress && resyncProgress.status === 'running';
  const masteredCount = allCards.filter((c) => c.mastered).length;

  return (
    <Screen {...deckPan.panHandlers}>
      <GestureHint visible={showHint} onDismiss={dismissHint} />
      <CodeModal visible={codeVisible} code={card.code} onClose={() => setCodeVisible(false)} />

      <ScreenHeader
        title="Study"
        subtitle={`${idx + 1} of ${total} · ${masteredCount} mastered`}
        right={headerRight}
      />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <ResyncBanner progress={resyncProgress} />

      <Animated.View
        style={[styles.deck, { transform: [{ translateY: slideAnim }] }]}
      >
        <FlipCard
          card={card}
          onShowCode={() => setCodeVisible(true)}
        />
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
          <MasteredButton mastered={card.mastered} onPress={handleMastered} style={styles.masteredWrap} />
          <TouchableOpacity
            style={[styles.navBtn, idx >= total - 1 && styles.dim]}
            onPress={next}
            disabled={idx >= total - 1}
          >
            <Text style={styles.navLabel}>Next ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actRow}>
          <TouchableOpacity
            style={styles.actBtn}
            onPress={() => rebuildDeck(allCards)}
          >
            <Text style={styles.actLabel}>Shuffle</Text>
          </TouchableOpacity>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  masteredWrap: { flex: 1 },

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
  actLabel: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 12 },

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
});
