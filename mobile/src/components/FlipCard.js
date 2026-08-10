import React, { useRef, useEffect, useCallback } from 'react';
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
export const CARD_H = SCREEN_H * 0.58;
const SWIPE_X = 50;

function CardFront({ card }) {
  const hasDesc = card.description && card.description.length > 10;
  const hasExample = card.example && card.example.length > 5;

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
        <Text style={styles.sectionHead}>Problem</Text>
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
      </ScrollView>
      <Text style={styles.hint}>Swipe right to see approach →</Text>
    </View>
  );
}

function CardBack({ card, onShowCode }) {
  const hasApproach =
    card.approach &&
    card.approach.length > 10 &&
    !card.approach.startsWith('Set a valid') &&
    !card.approach.startsWith('Approach not available') &&
    card.approach !== 'See code.';

  return (
    <View style={[styles.inner, { justifyContent: 'space-between' }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.backBody}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
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
        {card.pattern && card.pattern.length > 0 && card.pattern !== '—' ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Pattern</Text>
            <View style={styles.metaBadge}>
              <Text style={styles.metaBadgeText}>{card.pattern}</Text>
            </View>
          </View>
        ) : null}
        {card.time_complexity && card.time_complexity !== '—' ? (
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
        ) : null}
      </ScrollView>
      <View style={styles.backFooter}>
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

export default function FlipCard({ card, onShowCode, compact = false }) {
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
        <CardFront card={card} />
      </Animated.View>
      <Animated.View
        style={[
          styles.face,
          styles.faceBack,
          { width: w, height: h, transform: [{ perspective: 1200 }, { rotateY: bRot }], opacity: bOp },
        ]}
      >
        <CardBack card={card} onShowCode={onShowCode} />
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
  inner: { flex: 1, padding: 22 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeLabel: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.2 },
  problemTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.dark,
    lineHeight: 27,
    marginBottom: 12,
  },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 14 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 8 },
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
    marginTop: 18,
    backgroundColor: '#f8f9fc',
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
  backBody: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
  approachHeader: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: C.primary,
    textTransform: 'uppercase',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  approachCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 18,
    shadowColor: C.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  approachText: { fontSize: 15, fontFamily: fonts.regular, color: C.dark, lineHeight: 25 },
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
  cxRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 12 },
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
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.codeBg,
    paddingVertical: 13,
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
