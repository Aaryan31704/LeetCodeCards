import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchPlacards,
  fetchPlacardById,
  toggleMastered,
  resyncCards,
  getResyncStatus,
  syncNow,
  setAuthToken,
} from '../api';
import { useAuth } from '../context/AuthContext';
import FlipCard from '../components/FlipCard';
import LearnLesson from '../components/LearnLesson';
import StudyModeToggle from '../components/StudyModeToggle';
import CodeModal from '../components/CodeModal';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import AppButton from '../components/AppButton';
import StatusView from '../components/StatusView';
import MasteredButton from '../components/MasteredButton';
import { C, fonts, learnOrder, reviewOrder } from '../theme';

const HINT_KEY = '@leetplacards_learn_review_hint_seen';

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
          <Text style={styles.hintLine}>Learn walks from a concrete example to your algorithm.</Text>
          <Text style={styles.hintLine}>Mark a problem mastered when the reasoning makes sense.</Text>
          <Text style={styles.hintLine}>Review then uses quick flip cards to test your recall.</Text>
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
  const [studyMode, setStudyMode] = useState('learn');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [codeVisible, setCodeVisible] = useState(false);
  const [modalCode, setModalCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [resyncProgress, setResyncProgress] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pollRef = useRef(null);
  const hasLoadedRef = useRef(false);
  const modeRef = useRef('learn');

  const rebuildDeck = useCallback((source, mode = modeRef.current) => {
    setCards(mode === 'review' ? reviewOrder(source) : learnOrder(source));
    setIdx(0);
  }, []);

  const load = useCallback(async () => {
    const firstLoad = !hasLoadedRef.current;
    if (firstLoad) setLoading(true);
    setError(null);
    try {
      const data = await fetchPlacards(true, false);
      hasLoadedRef.current = true;
      setAllCards(data);
      const eligible = modeRef.current === 'review'
        ? data.filter((item) => item.mastered)
        : data;
      setCards((previous) => {
        if (firstLoad || previous.length === 0) {
          return modeRef.current === 'review' ? reviewOrder(data) : learnOrder(data);
        }
        const latest = new Map(data.map((item) => [item.id, item]));
        const kept = previous
          .filter((item) => latest.has(item.id))
          .map((item) => latest.get(item.id))
          .filter((item) => modeRef.current !== 'review' || item.mastered);
        const seen = new Set(kept.map((item) => item.id));
        return [...kept, ...eligible.filter((item) => !seen.has(item.id))];
      });
      setIdx((current) => Math.min(current, Math.max(eligible.length - 1, 0)));
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    (async () => {
      try {
        const result = await syncNow();
        if ((result?.placards_created_or_updated || 0) > 0) {
          await load();
        }
      } catch (_) {}
      try {
        const s = await getResyncStatus();
        if (s.status === 'running') {
          setResyncProgress(s);
          startPolling();
        }
      } catch (_) {}
    })();
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
  const masteredCount = useMemo(
    () => allCards.filter((item) => item.mastered).length,
    [allCards]
  );
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

  const handleMastered = async () => {
    if (!card) return;
    try {
      const res = await toggleMastered(card.id);
      Haptics.notificationAsync(
        res.mastered
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      const updatedAll = allCards.map((item) =>
        item.id === card.id ? { ...item, mastered: res.mastered } : item
      );
      setAllCards(updatedAll);
      if (studyMode === 'review' && !res.mastered) {
        const remaining = cards.filter((item) => item.id !== card.id);
        setCards(remaining);
        setIdx((current) => Math.min(current, Math.max(remaining.length - 1, 0)));
      } else {
        setCards((previous) =>
          previous.map((item) =>
            item.id === card.id ? { ...item, mastered: res.mastered } : item
          )
        );
      }
    } catch (e) {
      Alert.alert('Could not update progress', e.message || 'Please try again.');
    }
  };

  const handleModeChange = useCallback((mode) => {
    if (mode === modeRef.current) return;
    Haptics.selectionAsync().catch(() => {});
    modeRef.current = mode;
    setStudyMode(mode);
    rebuildDeck(allCards, mode);
  }, [allCards, rebuildDeck]);

  const handleResync = (force = false) => {
    const title = force ? 'Full Resync' : 'Smart Resync';
    const msg = force
      ? 'Re-fetch ALL problems from LeetCode and re-analyze all code. Runs in the background.'
      : 'Only re-process cards missing explanations, worked examples, or approaches.';
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

  const handleShowCode = async () => {
    if (!card) return;
    setCodeVisible(true);
    if (card.code) {
      setModalCode(card.code);
      return;
    }
    setModalCode('');
    setCodeLoading(true);
    try {
      const fullCard = await fetchPlacardById(card.id);
      setModalCode(fullCard.code || '');
    } catch (e) {
      setModalCode(`Could not load code: ${e.message || 'Unknown error'}`);
    } finally {
      setCodeLoading(false);
    }
  };

  const headerRight = (
    <View style={styles.headerActions}>
      <TouchableOpacity
        style={styles.headerIcon}
        onPress={() => navigation.navigate('ConnectRepo')}
        hitSlop={8}
      >
        <Ionicons name="git-branch-outline" size={17} color={C.cyan} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerIcon}
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
        <Ionicons name="log-out-outline" size={17} color={C.textSecondary} />
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

  const isResyncing = resyncProgress && resyncProgress.status === 'running';

  if (!card && allCards.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Study" subtitle="0 cards" right={headerRight} />
        <ResyncBanner progress={resyncProgress} />
        <StatusView
          loading={isResyncing}
          title={isResyncing ? 'Importing your solutions…' : 'No cards yet'}
          message={
            isResyncing
              ? 'Existing files in the repo are being turned into cards. This can take a few minutes.'
              : 'Cards come from files already in the repo. If solutions sit at the repo root (not in a LeetCode/ folder), tap Import — you do not need to push again.'
          }
          actionLabel={isResyncing ? undefined : 'Import existing solutions'}
          onAction={isResyncing ? undefined : () => handleResync(true)}
        />
      </Screen>
    );
  }

  if (!card) {
    return (
      <Screen bottomInset>
        <ScreenHeader
          title={studyMode === 'review' ? 'Review' : 'Learn'}
          subtitle={`${masteredCount} OF ${allCards.length} MASTERED`}
          right={headerRight}
        />
        <StudyModeToggle value={studyMode} onChange={handleModeChange} />
        <ResyncBanner progress={resyncProgress} />
        <StatusView
          title="Nothing to review yet"
          message="Learn a problem first, then mark it mastered. It will appear here for quick recall."
          actionLabel="Go to Learn"
          onAction={() => handleModeChange('learn')}
        />
      </Screen>
    );
  }

  const progress = total > 0 ? (idx + 1) / total : 0;

  return (
    <Screen bottomInset>
      <GestureHint visible={showHint} onDismiss={dismissHint} />
      <CodeModal
        visible={codeVisible}
        code={modalCode}
        loading={codeLoading}
        onClose={() => setCodeVisible(false)}
      />

      <ScreenHeader
        title={studyMode === 'learn' ? 'Learn' : 'Review'}
        subtitle={`PROBLEM ${idx + 1} OF ${total}  ·  ${masteredCount} MASTERED`}
        right={headerRight}
      />

      <StudyModeToggle value={studyMode} onChange={handleModeChange} />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <ResyncBanner progress={resyncProgress} />

      <Animated.View
        style={[styles.deck, { transform: [{ translateY: slideAnim }] }]}
      >
        {studyMode === 'learn' ? (
          <LearnLesson card={card} onShowCode={handleShowCode} />
        ) : (
          <FlipCard card={card} onShowCode={handleShowCode} />
        )}
      </Animated.View>

      <View style={styles.controls}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, idx === 0 && styles.dim]}
            onPress={prev}
            disabled={idx === 0}
          >
            <Ionicons name="chevron-back" size={19} color={C.textSecondary} />
          </TouchableOpacity>
          <MasteredButton mastered={card.mastered} onPress={handleMastered} style={styles.masteredWrap} />
          <TouchableOpacity
            style={[styles.navBtn, idx >= total - 1 && styles.dim]}
            onPress={next}
            disabled={idx >= total - 1}
          >
            <Ionicons name="chevron-forward" size={19} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.actRow}>
          <TouchableOpacity
            style={styles.actBtn}
            onPress={() => rebuildDeck(allCards, studyMode)}
          >
            <Ionicons name="shuffle" size={15} color={C.cyan} />
            <Text style={styles.actLabel}>Shuffle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actBtn, isResyncing && { opacity: 0.5 }]}
            onPress={() => handleResync(false)}
            disabled={isResyncing}
          >
            <Ionicons name="refresh" size={15} color={C.cyan} />
            <Text style={styles.actLabel}>{isResyncing ? 'Syncing...' : 'Resync'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actBtn, isResyncing && { opacity: 0.5 }]}
            onPress={() => handleResync(true)}
            disabled={isResyncing}
          >
            <Ionicons name="sparkles-outline" size={15} color={C.violet} />
            <Text style={[styles.actLabel, { color: C.violet }]}>Rebuild AI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  masteredWrap: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },

  progressTrack: {
    height: 4,
    backgroundColor: C.glass,
    marginHorizontal: 20,
    borderRadius: 2,
    marginTop: 6,
    marginBottom: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.cyan,
    borderRadius: 2,
    shadowColor: C.cyan,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  resyncBanner: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 2,
    backgroundColor: C.glass,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.cyanBorder,
    padding: 10,
  },
  resyncText: {
    fontSize: 12,
    color: C.cyan,
    fontFamily: fonts.semiBold,
    marginBottom: 6,
  },
  resyncTrack: {
    height: 4,
    backgroundColor: C.surfaceDeep,
    borderRadius: 2,
    overflow: 'hidden',
  },
  resyncFill: { height: '100%', backgroundColor: C.cyan, borderRadius: 2 },

  deck: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  controls: {
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
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
    backgroundColor: C.surfaceDeep,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  dim: { opacity: 0.3 },
  actRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  actBtn: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: C.surfaceDeep,
    borderWidth: 1,
    borderColor: C.glassBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actLabel: { color: C.cyan, fontFamily: fonts.semiBold, fontSize: 11 },

  hintOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  hintCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 340,
  },
  hintTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  hintLine: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: C.textSecondary,
    lineHeight: 28,
    marginBottom: 4,
  },
});
