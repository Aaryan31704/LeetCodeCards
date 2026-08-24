import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import DiffBadge from './DiffBadge';
import { C, fonts } from '../theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
export const CARD_W = SCREEN_W - 36;
export const CARD_H = SCREEN_H * 0.6;
const SWIPE_X = 50;

function hasText(s) {
  const t = (s || '').trim();
  return t.length > 6 && t !== '—' && t !== 'See code.';
}

function isMissingApproach(s) {
  const t = (s || '').trim();
  return (
    !t ||
    t.startsWith('Set a valid') ||
    t.startsWith('Approach not available') ||
    t === 'See code.'
  );
}

/** If older cards dumped every field into `approach`, keep only the steps. */
function extractSteps(card) {
  let text = (card.approach || '').trim();
  if (isMissingApproach(text)) return '';
  const insight = (card.core_insight || '').trim();
  if (insight && text.startsWith(insight)) {
    text = text.slice(insight.length).trim();
  }
  const markers = ['Why it works:', 'Recognize this when:', 'Common mistakes:', 'Transfer:'];
  let cut = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && i < cut) cut = i;
  }
  return text.slice(0, cut).trim();
}

function Collapsible({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.collapse}>
      <TouchableOpacity
        style={styles.collapseHead}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.collapseLabel}>{label}</Text>
        <Text style={styles.collapseChevron}>{open ? '−' : '+'}</Text>
      </TouchableOpacity>
      {open ? <View style={styles.collapseBody}>{children}</View> : null}
    </View>
  );
}

function CardFront({ card }) {
  const clues = hasText(card.recognition_clues);
  const hasDesc = hasText(card.description);
  const hasExample = card.example && card.example.length > 5;
  const [showProblem, setShowProblem] = useState(!clues);

  return (
    <View style={styles.inner}>
      <View style={styles.badgeRow}>
        <DiffBadge difficulty={card.difficulty} />
        {card.mastered ? (
          <View style={[styles.badge, { backgroundColor: C.successBg }]}>
            <Text style={[styles.badgeLabel, { color: C.success }]}>Mastered</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.problemTitle}>{card.problem_name}</Text>
      <View style={styles.rule} />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {clues ? (
          <>
            <Text style={styles.huntPrompt}>Name the pattern</Text>
            <View style={styles.clueCard}>
              <Text style={styles.clueLabel}>Look for</Text>
              <Text style={styles.clueText}>{card.recognition_clues}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowProblem((v) => !v)}
              activeOpacity={0.7}
              style={styles.toggleRow}
            >
              <Text style={styles.toggleText}>
                {showProblem ? 'Hide problem' : 'Need the problem?'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.sectionHead}>Problem</Text>
        )}

        {(!clues || showProblem) && (
          <>
            {hasDesc ? (
              <Text style={styles.desc}>{card.description}</Text>
            ) : (
              <Text style={styles.placeholder}>
                No description yet. Tap Resync on the deck to fetch from LeetCode.
              </Text>
            )}
            {hasExample ? (
              <View style={styles.exBox}>
                <Text style={styles.exLabel}>Example</Text>
                <Text style={styles.exText}>{card.example}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <Text style={styles.hint}>{clues ? 'Swipe right to reveal →' : 'Swipe right to see approach →'}</Text>
    </View>
  );
}

function ComplexityRow({ card }) {
  if (!card.time_complexity || card.time_complexity === '—') return null;
  return (
    <View style={styles.cxRow}>
      <View style={styles.cxBox}>
        <Text style={styles.cxLabel}>Time</Text>
        <Text style={styles.cxVal}>{card.time_complexity}</Text>
      </View>
      {card.space_complexity && card.space_complexity !== '—' ? (
        <View style={styles.cxBox}>
          <Text style={styles.cxLabel}>Space</Text>
          <Text style={styles.cxVal}>{card.space_complexity}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TransferReveal({ question }) {
  const [open, setOpen] = useState(false);
  if (!hasText(question)) return null;
  return (
    <TouchableOpacity
      style={styles.transferBox}
      onPress={() => {
        if (!open) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        setOpen(true);
      }}
      activeOpacity={0.8}
    >
      <Text style={styles.transferLabel}>{open ? 'Transfer' : 'Tap to transfer'}</Text>
      <Text style={open ? styles.transferQ : styles.transferHint}>
        {open ? question : 'Would you reach for this on a different problem?'}
      </Text>
    </TouchableOpacity>
  );
}

function StructuredBack({ card }) {
  const steps = extractSteps(card);
  return (
    <>
      {hasText(card.pattern) ? (
        <View style={styles.revealWrap}>
          <Text style={styles.revealKicker}>It’s</Text>
          <Text style={styles.revealPattern}>{card.pattern}</Text>
        </View>
      ) : null}
      {hasText(card.core_insight) ? (
        <View style={styles.insightCard}>
          <Text style={styles.insightLabel}>Core insight</Text>
          <Text style={styles.insightText}>{card.core_insight}</Text>
        </View>
      ) : null}
      {steps ? (
        <View style={styles.approachCard}>
          <Text style={styles.stepsLabel}>Approach</Text>
          <Text style={styles.approachText}>{steps}</Text>
        </View>
      ) : !hasText(card.core_insight) ? (
        <Text style={styles.placeholder}>
          No approach yet. Tap Resync on the deck to analyze your code.
        </Text>
      ) : null}
      {hasText(card.why_it_works) ? (
        <Collapsible label="Why it works">
          <Text style={styles.collapseText}>{card.why_it_works}</Text>
        </Collapsible>
      ) : null}
      {hasText(card.common_mistakes) ? (
        <Collapsible label="Common traps">
          <Text style={styles.collapseText}>{card.common_mistakes}</Text>
        </Collapsible>
      ) : null}
      {hasText(card.complexity) && !card.time_complexity ? (
        <Collapsible label="Complexity">
          <Text style={styles.collapseText}>{card.complexity}</Text>
        </Collapsible>
      ) : null}
      <ComplexityRow card={card} />
      {hasText(card.summary) ? (
        <Text style={styles.solverNote}>{card.summary}</Text>
      ) : null}
      <TransferReveal question={card.transfer_question} />
    </>
  );
}

function LegacyBack({ card }) {
  const hasApproach = !isMissingApproach(card.approach) && hasText(card.approach);
  return (
    <>
      <Text style={styles.approachHeader}>Approach</Text>
      <View style={styles.approachCard}>
        {hasApproach ? (
          <Text style={styles.approachText}>{card.approach}</Text>
        ) : (
          <Text style={styles.placeholder}>
            No approach yet. Tap Resync on the deck to analyze your code.
          </Text>
        )}
      </View>
      {hasText(card.pattern) ? (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Pattern</Text>
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText}>{card.pattern}</Text>
          </View>
        </View>
      ) : null}
      <ComplexityRow card={card} />
    </>
  );
}

function CardBack({ card, onShowCode, onGotIt, onNotYet }) {
  const structured = hasText(card.core_insight) || hasText(card.recognition_clues);

  return (
    <View style={[styles.inner, { justifyContent: 'space-between' }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.backBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {structured ? <StructuredBack card={card} /> : <LegacyBack card={card} />}
      </ScrollView>
      <View style={styles.backFooter}>
        {onGotIt ? (
          <View style={styles.gradeRow}>
            <TouchableOpacity
              style={styles.missBtn}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                onNotYet?.();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.missLabel}>Not yet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.gotBtn}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                onGotIt();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.gotLabel}>Got it</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {onShowCode ? (
          <TouchableOpacity style={styles.codeBtn} onPress={onShowCode} activeOpacity={0.7}>
            <Text style={styles.codeBtnIcon}>{'</>'}</Text>
            <Text style={styles.codeBtnText}>View Code</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.hint}>← Swipe left to flip back</Text>
      </View>
    </View>
  );
}

export default function FlipCard({ card, onShowCode, onGotIt, onNotYet, compact = false }) {
  const flipAnim = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);

  const flipTo = useCallback(
    (to) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.spring(flipAnim, {
        toValue: to ? 1 : 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
      isFlipped.current = to;
    },
    [flipAnim]
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_X && !isFlipped.current) flipTo(true);
        else if (g.dx < -SWIPE_X && isFlipped.current) flipTo(false);
      },
    })
  ).current;

  useEffect(() => {
    flipAnim.setValue(0);
    isFlipped.current = false;
  }, [card.id, flipAnim]);

  const fRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const bRot = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const fOp = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const bOp = flipAnim.interpolate({ inputRange: [0, 0.5, 0.5, 1], outputRange: [0, 0, 1, 1] });

  const h = compact ? CARD_H * 0.85 : CARD_H;
  const w = compact ? CARD_W - 8 : CARD_W;

  return (
    <View {...pan.panHandlers} style={[styles.flipWrap, { width: w, height: h }]}>
      {!compact ? (
        <>
          <View style={[styles.stackCard, styles.stack3, { width: w - 16, height: h }]} />
          <View style={[styles.stackCard, styles.stack2, { width: w - 8, height: h }]} />
        </>
      ) : null}
      <Animated.View
        style={[
          styles.face,
          styles.faceFront,
          { width: w, height: h, transform: [{ perspective: 1200 }, { rotateY: fRot }], opacity: fOp },
        ]}
      >
        <CardFront key={`f-${card.id}`} card={card} />
      </Animated.View>
      <Animated.View
        style={[
          styles.face,
          styles.faceBack,
          { width: w, height: h, transform: [{ perspective: 1200 }, { rotateY: bRot }], opacity: bOp },
        ]}
      >
        <CardBack
          key={`b-${card.id}`}
          card={card}
          onShowCode={onShowCode}
          onGotIt={onGotIt}
          onNotYet={onNotYet}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flipWrap: { alignItems: 'center', justifyContent: 'center' },
  stackCard: {
    position: 'absolute',
    borderRadius: 20,
    backgroundColor: C.white,
  },
  stack3: { top: 8, opacity: 0.25, transform: [{ scale: 0.94 }] },
  stack2: { top: 4, opacity: 0.5, transform: [{ scale: 0.97 }] },
  face: {
    borderRadius: 20,
    position: 'absolute',
    backfaceVisibility: 'hidden',
    overflow: 'hidden',
  },
  faceFront: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    elevation: 8,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  faceBack: {
    backgroundColor: C.cardBack,
    borderWidth: 1,
    borderColor: C.primary + '20',
    elevation: 8,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  inner: { flex: 1, padding: 20 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeLabel: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.2 },
  problemTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.dark,
    lineHeight: 27,
    marginBottom: 10,
  },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 8 },
  huntPrompt: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  clueCard: {
    backgroundColor: C.primarySoft,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.primary + '18',
    marginBottom: 8,
  },
  clueLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  clueText: { fontSize: 16, fontFamily: fonts.medium, color: C.dark, lineHeight: 24 },
  toggleRow: { paddingVertical: 8, marginBottom: 4 },
  toggleText: { fontSize: 13, fontFamily: fonts.semiBold, color: C.primary },
  sectionHead: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  desc: { fontSize: 15, fontFamily: fonts.regular, color: C.mid, lineHeight: 24 },
  placeholder: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: C.muted,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  exBox: {
    marginTop: 16,
    backgroundColor: C.cardBack,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  exLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  exText: { fontSize: 13.5, color: C.dark, lineHeight: 21, fontFamily: 'monospace' },
  hint: {
    fontSize: 11,
    color: C.muted,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: fonts.medium,
  },
  backBody: { flexGrow: 1, paddingVertical: 4, paddingBottom: 12 },
  revealWrap: { alignItems: 'center', marginBottom: 14 },
  revealKicker: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
  },
  revealPattern: {
    fontSize: 26,
    fontFamily: fonts.bold,
    color: C.dark,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  insightCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  insightLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  insightText: { fontSize: 15, fontFamily: fonts.medium, color: C.dark, lineHeight: 23 },
  approachHeader: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  stepsLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.light,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  approachCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 12,
  },
  approachText: { fontSize: 15, fontFamily: fonts.regular, color: C.dark, lineHeight: 24 },
  collapse: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  collapseHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  collapseLabel: { fontSize: 13, fontFamily: fonts.semiBold, color: C.mid },
  collapseChevron: { fontSize: 16, color: C.light, fontFamily: fonts.bold },
  collapseBody: { paddingHorizontal: 14, paddingBottom: 12 },
  collapseText: { fontSize: 14, fontFamily: fonts.regular, color: C.mid, lineHeight: 22 },
  solverNote: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: C.mid,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  transferBox: {
    backgroundColor: C.primarySoft,
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.primary + '18',
  },
  transferLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  transferHint: { fontSize: 14, fontFamily: fonts.medium, color: C.mid, lineHeight: 21 },
  transferQ: { fontSize: 15, fontFamily: fonts.medium, color: C.dark, lineHeight: 22 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  metaLabel: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: C.light,
    textTransform: 'uppercase',
  },
  metaBadge: {
    backgroundColor: C.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  metaBadgeText: { fontSize: 13, fontFamily: fonts.semiBold, color: C.primary },
  cxRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 8, marginTop: 4 },
  cxBox: {
    backgroundColor: C.primarySoft,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  cxLabel: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: C.light,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  cxVal: { fontSize: 15, fontFamily: fonts.bold, color: C.primary },
  backFooter: { paddingTop: 4 },
  gradeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  missBtn: {
    flex: 1,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  missLabel: { fontSize: 14, fontFamily: fonts.semiBold, color: C.mid },
  gotBtn: {
    flex: 1,
    backgroundColor: C.success,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  gotLabel: { fontSize: 14, fontFamily: fonts.bold, color: C.white },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.codeBg,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  codeBtnIcon: { fontSize: 15, color: C.primary, fontFamily: 'monospace', fontWeight: '700' },
  codeBtnText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: C.codeText,
    letterSpacing: 0.3,
  },
});
