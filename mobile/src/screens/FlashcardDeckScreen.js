import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  PanResponder,
  ScrollView,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import { fetchPlacards, toggleMastered, resyncCards, getResyncStatus, syncNow } from '../api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W - 36;
const CARD_H = SCREEN_H * 0.65;
const SWIPE_X = 50;
const SWIPE_Y = 60;

const C = {
  bg: '#f1f5f9',
  card: '#ffffff',
  cardBack: '#f8faff',
  primary: '#5b7ff7',
  primarySoft: '#edf1ff',
  dark: '#1e293b',
  mid: '#475569',
  light: '#94a3b8',
  muted: '#cbd5e1',
  border: '#e2e8f0',
  shadow: '#334155',
  easy: '#16a34a',
  easyBg: '#f0fdf4',
  medium: '#d97706',
  mediumBg: '#fffbeb',
  hard: '#dc2626',
  hardBg: '#fef2f2',
  success: '#10b981',
  successBg: '#ecfdf5',
  white: '#ffffff',
  codeBg: '#1e293b',
  codeText: '#e2e8f0',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function DiffBadge({ difficulty }) {
  const d = (difficulty || 'Medium').toLowerCase();
  const m = {
    easy: { bg: C.easyBg, fg: C.easy },
    medium: { bg: C.mediumBg, fg: C.medium },
    hard: { bg: C.hardBg, fg: C.hard },
  };
  const s = m[d] || m.medium;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeLabel, { color: s.fg }]}>{difficulty || 'Medium'}</Text>
    </View>
  );
}

/* ── CODE MODAL ── */
function CodeModal({ visible, code, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.modalWrap}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Your Code</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.codeScroll} contentContainerStyle={styles.codeContent}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Text style={styles.codeText} selectable>{code || 'No code available.'}</Text>
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/* ── RESYNC PROGRESS BAR ── */
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

/* ── FRONT OF CARD ── */
function CardFront({ card }) {
  const hasDesc = card.description && card.description.length > 10;
  const hasExample = card.example && card.example.length > 5;

  return (
    <View style={styles.inner}>
      <View style={styles.badgeRow}>
        <DiffBadge difficulty={card.difficulty} />
        {card.mastered && (
          <View style={[styles.badge, { backgroundColor: C.successBg }]}>
            <Text style={[styles.badgeLabel, { color: C.success }]}>Mastered</Text>
          </View>
        )}
      </View>
      <Text style={styles.problemTitle}>{card.problem_name}</Text>
      <View style={styles.rule} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <Text style={styles.sectionHead}>Problem</Text>
        {hasDesc ? (
          <Text style={styles.desc}>{card.description}</Text>
        ) : (
          <Text style={styles.placeholder}>No description yet. Tap "Resync" to fetch from LeetCode.</Text>
        )}
        {hasExample && (
          <View style={styles.exBox}>
            <Text style={styles.exLabel}>Example</Text>
            <Text style={styles.exText}>{card.example}</Text>
          </View>
        )}
      </ScrollView>
      <Text style={styles.hint}>Swipe right to see approach →</Text>
    </View>
  );
}

/* ── BACK OF CARD ── */
function CardBack({ card, onShowCode }) {
  const hasApproach =
    card.approach && card.approach.length > 10 &&
    !card.approach.startsWith('Set a valid') &&
    !card.approach.startsWith('Approach not available') &&
    card.approach !== 'See code.';

  return (
    <View style={[styles.inner, { justifyContent: 'space-between' }]}>
      <ScrollView style={styles.body} contentContainerStyle={styles.backBody} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        <Text style={styles.approachHeader}>Approach</Text>
        <View style={styles.approachCard}>
          {hasApproach ? (
            <Text style={styles.approachText}>{card.approach}</Text>
          ) : (
            <Text style={styles.placeholder}>No approach yet. Tap "Resync" to analyze your code.</Text>
          )}
        </View>
        {card.pattern && card.pattern.length > 0 && card.pattern !== '—' && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Pattern</Text>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>{card.pattern}</Text>
            </View>
          </View>
        )}
        {card.time_complexity && card.time_complexity !== '—' && (
          <View style={styles.cxRow}>
            <View style={styles.cxBox}>
              <Text style={styles.cxLabel}>Time</Text>
              <Text style={styles.cxVal}>{card.time_complexity}</Text>
            </View>
            {card.space_complexity && card.space_complexity !== '—' && (
              <View style={styles.cxBox}>
                <Text style={styles.cxLabel}>Space</Text>
                <Text style={styles.cxVal}>{card.space_complexity}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
      <View style={styles.backFooter}>
        <TouchableOpacity style={styles.codeBtn} onPress={onShowCode} activeOpacity={0.7}>
          <Text style={styles.codeBtnIcon}>{'</>'}</Text>
          <Text style={styles.codeBtnText}>View Code</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>← Swipe left to flip back</Text>
      </View>
    </View>
  );
}

/* ── FLIP CARD ── */
function FlipCard({ card, onShowCode }) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);
  const flipTo = useCallback((to) => {
    Animated.spring(flipAnim, { toValue: to ? 1 : 0, friction: 8, tension: 50, useNativeDriver: true }).start();
    isFlipped.current = to;
  }, [flipAnim]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_X && !isFlipped.current) flipTo(true);
      else if (g.dx < -SWIPE_X && isFlipped.current) flipTo(false);
    },
  })).current;

  useEffect(() => { flipAnim.setValue(0); isFlipped.current = false; }, [card.id, flipAnim]);

  const fRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const bRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const fOp = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const bOp = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View {...pan.panHandlers} style={styles.flipWrap}>
      <View style={[styles.stackCard, styles.stack3]} />
      <View style={[styles.stackCard, styles.stack2]} />
      <Animated.View style={[styles.face, styles.faceFront, { transform: [{ perspective: 1200 }, { rotateY: fRot }], opacity: fOp }]}>
        <CardFront card={card} />
      </Animated.View>
      <Animated.View style={[styles.face, styles.faceBack, { transform: [{ perspective: 1200 }, { rotateY: bRot }], opacity: bOp }]}>
        <CardBack card={card} onShowCode={onShowCode} />
      </Animated.View>
    </View>
  );
}

/* ── MAIN SCREEN ── */
export default function FlashcardDeckScreen({ navigation }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [idx, setIdx] = useState(0);
  const [codeVisible, setCodeVisible] = useState(false);
  const [resyncProgress, setResyncProgress] = useState(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlacards(true);
      setCards(shuffle(data));
      setIdx(0);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    syncNow().catch(() => {});
  }, [load]);

  const card = cards[idx] || null;
  const total = cards.length;
  const idxRef = useRef(idx);
  const totalRef = useRef(total);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  useEffect(() => { totalRef.current = total; }, [total]);

  // Resync polling
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await getResyncStatus();
        setResyncProgress(s);
        if (s.status === 'done' || s.status === 'error' || s.status === 'idle') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (s.status === 'done' && s.total > 0) {
            await load();
          }
          if (s.status === 'error') {
            Alert.alert('Resync Error', s.current || 'Something went wrong.');
          }
          setTimeout(() => setResyncProgress(null), 3000);
        }
      } catch (_) {}
    }, 2500);
  }, [load]);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const slide = useCallback((to) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setIdx(to);
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    });
  }, [fadeAnim]);

  const deckPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 15 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => {
      const ci = idxRef.current;
      const t = totalRef.current;
      if (g.dy < -SWIPE_Y && ci < t - 1) {
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
          setIdx(ci + 1);
          Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        });
      } else if (g.dy > SWIPE_Y && ci > 0) {
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
          setIdx(ci - 1);
          Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
        });
      }
    },
  })).current;

  const next = useCallback(() => { if (idx < total - 1) slide(idx + 1); }, [idx, total, slide]);
  const prev = useCallback(() => { if (idx > 0) slide(idx - 1); }, [idx, slide]);

  const handleMastered = async () => {
    if (!card) return;
    try {
      const res = await toggleMastered(card.id);
      setCards(p => p.map((c, i) => (i === idx ? { ...c, mastered: res.mastered } : c)));
    } catch (_) {}
  };

  const handleResync = (force = false) => {
    const title = force ? 'Full Resync' : 'Smart Resync';
    const msg = force
      ? 'Re-fetch ALL problems from LeetCode and re-analyze all code. Cards are processed one at a time in the background.'
      : 'Only re-process cards that are missing descriptions or approaches. Runs in the background.';
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
              setResyncProgress({ status: 'running', total: r.cards_to_process || 0, completed: 0, current: '' });
              startPolling();
            }
          } catch (e) {
            Alert.alert('Error', e.message || 'Resync failed');
          }
        },
      },
    ]);
  };

  /* States */
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
  if (!card) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 44, marginBottom: 12 }}>📚</Text>
        <Text style={[styles.centerText, { fontSize: 18, fontWeight: '700', color: C.dark }]}>No Cards Yet</Text>
        <Text style={[styles.centerText, { marginTop: 4 }]}>Push LeetCode solutions to your connected repo.</Text>
      </View>
    );
  }

  const progress = total > 0 ? (idx + 1) / total : 0;
  const isResyncing = resyncProgress && resyncProgress.status === 'running';

  return (
    <View style={styles.root} {...deckPan.panHandlers}>
      <CodeModal visible={codeVisible} code={card.code} onClose={() => setCodeVisible(false)} />

      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appName}>LeetPlacards</Text>
          <Text style={styles.counter}>{idx + 1} / {total} cards</Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => navigation.navigate('PlacardList')}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Resync progress banner */}
      <ResyncBanner progress={resyncProgress} />

      {/* Deck */}
      <Animated.View style={[styles.deck, { opacity: fadeAnim }]}>
        <FlipCard card={card} onShowCode={() => setCodeVisible(true)} />
      </Animated.View>

      {/* Controls */}
      <View style={styles.controls}>
        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, idx === 0 && styles.dim]} onPress={prev} disabled={idx === 0}>
            <Text style={styles.navLabel}>‹ Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.masteredBtn, card.mastered && styles.masteredBtnOn]} onPress={handleMastered}>
            <Text style={[styles.masteredLabel, card.mastered && styles.masteredLabelOn]}>
              {card.mastered ? '✓ Mastered' : 'Mark Mastered'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, idx >= total - 1 && styles.dim]} onPress={next} disabled={idx >= total - 1}>
            <Text style={styles.navLabel}>Next ›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actRow}>
          <TouchableOpacity style={styles.actBtn} onPress={() => { setCards(p => shuffle(p)); setIdx(0); }}>
            <Text style={styles.actLabel}>Shuffle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, isResyncing && { opacity: 0.5 }]} onPress={() => handleResync(false)} disabled={isResyncing}>
            <Text style={styles.actLabel}>{isResyncing ? 'Syncing...' : 'Resync'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn, isResyncing && { opacity: 0.5 }]} onPress={() => handleResync(true)} disabled={isResyncing}>
            <Text style={styles.actLabel}>Full Resync</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.gestureHint}>↔ swipe to flip  ·  ↕ swipe to navigate</Text>
      </View>
    </View>
  );
}

/* ── STYLES ── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: 50 },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', padding: 32 },
  centerText: { color: C.mid, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  pillBtn: { backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 28, borderRadius: 10 },
  pillBtnText: { color: C.white, fontWeight: '600', fontSize: 14 },

  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 4 },
  appName: { fontSize: 20, fontWeight: '800', color: C.dark, letterSpacing: -0.3 },
  counter: { fontSize: 12, color: C.light, marginTop: 1 },
  menuBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.white, justifyContent: 'center', alignItems: 'center', elevation: 2, shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
  menuIcon: { fontSize: 16, color: C.mid },

  progressTrack: { height: 3, backgroundColor: C.border, marginHorizontal: 20, borderRadius: 2, marginTop: 6, marginBottom: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },

  resyncBanner: { marginHorizontal: 20, marginTop: 6, marginBottom: 2, backgroundColor: C.primarySoft, borderRadius: 8, padding: 10 },
  resyncText: { fontSize: 12, color: C.primary, fontWeight: '600', marginBottom: 6 },
  resyncTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  resyncFill: { height: '100%', backgroundColor: C.primary, borderRadius: 2 },

  deck: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  flipWrap: { width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' },
  stackCard: { position: 'absolute', width: CARD_W - 16, height: CARD_H, borderRadius: 20, backgroundColor: C.white },
  stack3: { top: 8, opacity: 0.25, transform: [{ scale: 0.94 }] },
  stack2: { top: 4, opacity: 0.5, transform: [{ scale: 0.97 }] },

  face: { width: CARD_W, height: CARD_H, borderRadius: 20, position: 'absolute', backfaceVisibility: 'hidden', overflow: 'hidden' },
  faceFront: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, elevation: 8, shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24 },
  faceBack: { backgroundColor: C.cardBack, borderWidth: 1, borderColor: C.primary + '20', elevation: 8, shadowColor: C.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 24 },

  inner: { flex: 1, padding: 24 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  problemTitle: { fontSize: 20, fontWeight: '700', color: C.dark, lineHeight: 27, marginBottom: 14 },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 16 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 8 },
  sectionHead: { fontSize: 11, fontWeight: '700', color: C.primary, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  desc: { fontSize: 15, color: C.mid, lineHeight: 24, textAlign: 'left' },
  placeholder: { fontSize: 14, color: C.muted, lineHeight: 22, fontStyle: 'italic' },
  exBox: { marginTop: 20, backgroundColor: '#f8f9fc', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  exLabel: { fontSize: 11, fontWeight: '700', color: C.primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  exText: { fontSize: 13.5, color: C.dark, lineHeight: 21, fontFamily: 'monospace' },
  hint: { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 8, fontWeight: '500' },

  backBody: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  approachHeader: { fontSize: 14, fontWeight: '800', color: C.primary, textTransform: 'uppercase', letterSpacing: 2, textAlign: 'center', marginBottom: 18 },
  approachCard: { backgroundColor: C.white, borderRadius: 16, padding: 22, borderWidth: 1, borderColor: C.border, marginBottom: 22, shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  approachText: { fontSize: 16, color: C.dark, lineHeight: 26, textAlign: 'left' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 },
  metaLabel: { fontSize: 11, fontWeight: '600', color: C.light, textTransform: 'uppercase' },
  metaBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  metaBadgeText: { fontSize: 13, fontWeight: '600', color: C.primary },
  cxRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 12 },
  cxBox: { backgroundColor: C.primarySoft, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center' },
  cxLabel: { fontSize: 10, fontWeight: '600', color: C.light, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  cxVal: { fontSize: 15, fontWeight: '700', color: C.primary },
  backFooter: { paddingTop: 4 },
  codeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.codeBg, paddingVertical: 13, borderRadius: 12, marginBottom: 8 },
  codeBtnIcon: { fontSize: 15, color: C.primary, fontWeight: '700', fontFamily: 'monospace' },
  codeBtnText: { fontSize: 14, fontWeight: '700', color: C.codeText, letterSpacing: 0.3 },

  modalWrap: { flex: 1, backgroundColor: C.codeBg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: C.codeText },
  modalCloseBtn: { backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8 },
  modalCloseText: { color: C.primary, fontWeight: '600', fontSize: 14 },
  codeScroll: { flex: 1, backgroundColor: C.codeBg },
  codeContent: { padding: 20, paddingBottom: 40 },
  codeText: { fontSize: 13, lineHeight: 20, color: C.codeText, fontFamily: 'monospace' },

  controls: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 },
  navBtn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.white, elevation: 2, shadowColor: C.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  navLabel: { color: C.dark, fontWeight: '600', fontSize: 13 },
  dim: { opacity: 0.3 },
  masteredBtn: { flex: 1, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  masteredBtnOn: { backgroundColor: C.successBg, borderColor: C.success },
  masteredLabel: { color: C.mid, fontWeight: '600', fontSize: 13 },
  masteredLabelOn: { color: C.success },
  actRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 6 },
  actBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.primarySoft },
  actLabel: { color: C.primary, fontWeight: '600', fontSize: 12 },
  gestureHint: { textAlign: 'center', fontSize: 10, color: C.muted, fontWeight: '500', marginTop: 2 },
});
