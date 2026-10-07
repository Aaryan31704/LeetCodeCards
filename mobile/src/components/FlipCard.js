import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DiffBadge from './DiffBadge';
import { C, fonts, radius } from '../theme';

const SWIPE_X = 52;

function hasText(value) {
  const text = (value || '').trim();
  return text.length > 6 && text !== '—' && text !== 'See code.';
}

function isMissingApproach(value) {
  const text = (value || '').trim();
  return (
    !text ||
    text.startsWith('Set a valid') ||
    text.startsWith('Approach not available') ||
    text === 'See code.'
  );
}

function problemSections(description) {
  const blocks = (description || '').split(/\n\s*\n/).filter(Boolean);
  const known = /^(Goal|Given|Return|Key rule)\n/i;
  if (!blocks.some((block) => known.test(block))) {
    return [{ label: 'Mission brief', text: description }];
  }
  return blocks.map((block) => {
    const [label, ...rest] = block.split('\n');
    return { label, text: rest.join(' ').trim() };
  });
}

function approachSteps(value) {
  let text = (value || '').trim();
  if (isMissingApproach(text)) return [];
  const insightMarkers = ['Why it works:', 'Recognize this when:', 'Common mistakes:', 'Transfer:'];
  let cut = text.length;
  insightMarkers.forEach((marker) => {
    const index = text.indexOf(marker);
    if (index !== -1 && index < cut) cut = index;
  });
  text = text.slice(0, cut).trim();
  if (text.startsWith('[') && text.endsWith(']')) {
    text = text.slice(1, -1);
    return text
      .split(/['"]\s*,\s*['"]/)
      .map((step) => step.replace(/^['"]|['"]$/g, '').trim())
      .filter(Boolean);
  }
  const numbered = text
    .split(/\n+/)
    .map((step) => step.replace(/^(?:step\s*)?\d+[\).:\-]\s*/i, '').trim())
    .filter(Boolean);
  return numbered.length > 1 ? numbered : [text];
}

const CardFront = memo(function CardFront({ card }) {
  // Review is recall, not reading: the one-line task plus a sample is enough
  // of a cue. The full statement belongs in Learn.
  const prompt = (card.plain_explanation || '').trim();
  const sections = useMemo(
    () => (prompt ? [] : problemSections(card.description)),
    [prompt, card.description]
  );
  const hasExample = hasText(card.example);

  return (
    <View style={styles.inner}>
      <View style={styles.topline}>
        <DiffBadge difficulty={card.difficulty} />
        <Text style={styles.sideCode}>// PROBLEM</Text>
        {card.mastered ? (
          <View style={styles.masteredChip}>
            <Ionicons name="checkmark-circle" color={C.success} size={14} />
            <Text style={styles.masteredChipText}>MASTERED</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.problemTitle}>{card.problem_name}</Text>
      <View style={styles.neonRule} />
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {prompt ? (
          <Text style={styles.desc}>{prompt}</Text>
        ) : sections.length ? (
          sections.map((section, index) => (
            <View style={styles.briefRow} key={`${section.label}-${index}`}>
              <View style={styles.briefIndex}>
                <Text style={styles.briefIndexText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <View style={styles.briefCopy}>
                <Text style={styles.sectionHead}>{section.label}</Text>
                <Text style={styles.desc}>{section.text}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.placeholder}>Problem brief is being generated. Run Resync if it remains empty.</Text>
        )}
        {hasExample ? (
          <View style={styles.exampleBox}>
            <View style={styles.exampleHeader}>
              <Ionicons name="terminal-outline" size={14} color={C.cyan} />
              <Text style={styles.exampleLabel}>TEST VECTOR</Text>
            </View>
            <Text style={styles.exampleText}>{card.example}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.flipAction}>
        <Text style={styles.flipHint}>Swipe right or tap reveal</Text>
        <Ionicons name="arrow-forward" size={15} color={C.cyan} />
      </View>
    </View>
  );
});

const CardBack = memo(function CardBack({ card, onShowCode }) {
  const why = card.core_insight || '';
  const recommended = card.better_approach || card.approach;
  const steps = useMemo(() => approachSteps(recommended), [recommended]);
  const time = card.better_time_complexity || card.user_time_complexity;
  const space = card.better_space_complexity || card.user_space_complexity;

  return (
    <View style={styles.inner}>
      <View style={styles.revealHeader}>
        <Text style={styles.revealKicker}>PATTERN DECODED</Text>
        <Text style={styles.patternTitle}>{card.pattern || 'Analyzing pattern…'}</Text>
      </View>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.backBody}
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {hasText(why) ? (
          <View style={styles.insightCard}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="analytics-outline" size={16} color={C.violet} />
              <Text style={styles.insightLabel}>WHY IT FITS</Text>
            </View>
            <Text style={styles.insightText}>{why}</Text>
          </View>
        ) : null}

        <View style={styles.approachCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="git-network-outline" size={16} color={C.cyan} />
            <Text style={styles.stepsLabel}>RECALL THE APPROACH</Text>
          </View>
          {steps.length ? (
            steps.map((step, index) => (
              <View style={styles.stepRow} key={`${index}-${step.slice(0, 20)}`}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.placeholder}>Approach is queued for generation. Tap Resync on the deck.</Text>
          )}
          {(time || space) ? (
            <Text style={styles.complexityText}>
              Time {time || '—'}  ·  Space {space || '—'}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.backFooter}>
        <TouchableOpacity style={styles.codeButton} onPress={onShowCode} activeOpacity={0.75}>
          <Ionicons name="code-slash" size={17} color={C.cyan} />
          <Text style={styles.codeButtonText}>OPEN SOURCE</Text>
        </TouchableOpacity>
        <View style={styles.flipAction}>
          <Ionicons name="arrow-back" size={15} color={C.violet} />
          <Text style={styles.flipHint}>Swipe left or tap to return</Text>
        </View>
      </View>
    </View>
  );
});

function FlipCard({ card, onShowCode, compact = false }) {
  const { width, height } = useWindowDimensions();
  const flipAnim = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);
  const [flipped, setFlipped] = useState(false);

  const cardWidth = Math.min(width - 28, 520);
  const cardHeight = compact
    ? Math.min(Math.max(height * 0.5, 360), 520)
    : Math.min(Math.max(height * 0.56, 390), 590);

  const flipTo = useCallback((next) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.spring(flipAnim, {
      toValue: next ? 1 : 0,
      friction: 8,
      tension: 58,
      useNativeDriver: true,
    }).start();
    isFlipped.current = next;
    setFlipped(next);
  }, [flipAnim]);

  const toggleFlip = useCallback(() => flipTo(!isFlipped.current), [flipTo]);

  const pan = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_X && !isFlipped.current) flipTo(true);
        if (gesture.dx < -SWIPE_X && isFlipped.current) flipTo(false);
      },
    }),
    [flipTo]
  );

  useEffect(() => {
    flipAnim.setValue(0);
    isFlipped.current = false;
    setFlipped(false);
  }, [card.id, flipAnim]);

  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOpacity = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = flipAnim.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [0, 0, 1, 1] });

  return (
    <View {...pan.panHandlers} style={[styles.flipWrap, { width: cardWidth, height: cardHeight }]}>
      <View style={[styles.stackGlow, { width: cardWidth - 18, height: cardHeight - 2 }]} />
      <Animated.View
        pointerEvents={flipped ? 'none' : 'auto'}
        style={[
          styles.face,
          {
            width: cardWidth,
            height: cardHeight,
            opacity: frontOpacity,
            transform: [{ perspective: 1200 }, { rotateY: frontRotate }],
          },
        ]}
      >
        <LinearGradient colors={[C.surface, C.surfaceDeep]} style={styles.gradientFace}>
          <CardFront card={card} />
          <TouchableOpacity style={styles.faceTapZone} onPress={() => flipTo(true)} activeOpacity={1} />
        </LinearGradient>
      </Animated.View>
      <Animated.View
        pointerEvents={flipped ? 'auto' : 'none'}
        style={[
          styles.face,
          {
            width: cardWidth,
            height: cardHeight,
            opacity: backOpacity,
            transform: [{ perspective: 1200 }, { rotateY: backRotate }],
          },
        ]}
      >
        <LinearGradient colors={[C.surfaceViolet, C.surfaceDeep]} style={styles.gradientFace}>
          <CardBack card={card} onShowCode={onShowCode} />
          <TouchableOpacity style={styles.faceTapZone} onPress={toggleFlip} activeOpacity={1} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default memo(FlipCard);

const styles = StyleSheet.create({
  flipWrap: { alignItems: 'center', justifyContent: 'center' },
  stackGlow: {
    position: 'absolute',
    top: 10,
    borderRadius: radius.xl,
    backgroundColor: C.cyanGlow,
    opacity: 0.3,
  },
  face: {
    position: 'absolute',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    borderWidth: 1,
    borderColor: C.glassBorder,
    elevation: 12,
    shadowColor: C.cyan,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
  },
  gradientFace: { flex: 1 },
  faceTapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 42,
  },
  inner: { flex: 1, padding: 18 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sideCode: { color: C.textMuted, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 },
  masteredChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  masteredChipText: { color: C.success, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  problemTitle: { color: C.text, fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  neonRule: { height: 1, backgroundColor: C.cyan, opacity: 0.45, marginVertical: 12 },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 18 },
  briefRow: { flexDirection: 'row', gap: 12, marginBottom: 15 },
  briefIndex: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cyanSoft,
    borderWidth: 1,
    borderColor: C.cyanBorder,
  },
  briefIndexText: { color: C.cyan, fontFamily: 'monospace', fontSize: 10 },
  briefCopy: { flex: 1 },
  sectionHead: { color: C.cyan, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  desc: { color: C.textSecondary, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  placeholder: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
  exampleBox: { backgroundColor: C.codeBg, borderRadius: radius.md, borderWidth: 1, borderColor: C.glassBorder, padding: 13, marginTop: 2 },
  exampleHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  exampleLabel: { color: C.cyan, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.4 },
  exampleText: { color: C.codeText, fontFamily: 'monospace', fontSize: 12, lineHeight: 19 },
  flipAction: { height: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  flipHint: { color: C.textMuted, fontFamily: fonts.medium, fontSize: 11 },
  revealHeader: { alignItems: 'center', paddingBottom: 12 },
  revealKicker: { color: C.violet, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 2.2, marginBottom: 5 },
  patternTitle: { color: C.text, fontFamily: fonts.bold, fontSize: 27, textAlign: 'center', letterSpacing: -0.6 },
  backBody: { paddingBottom: 18 },
  insightCard: { backgroundColor: C.violetSoft, borderRadius: radius.lg, borderWidth: 1, borderColor: C.violetBorder, padding: 14, marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  insightLabel: { color: C.violet, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.4 },
  insightText: { color: C.textSecondary, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  approachCard: { backgroundColor: C.glass, borderRadius: radius.lg, borderWidth: 1, borderColor: C.cyanBorder, padding: 14 },
  stepsLabel: { color: C.cyan, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.4 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 11 },
  stepNumber: { width: 23, height: 23, borderRadius: 7, backgroundColor: C.cyanSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumberText: { color: C.cyan, fontFamily: fonts.bold, fontSize: 11 },
  stepText: { flex: 1, color: C.textSecondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  complexityText: { color: C.textMuted, fontFamily: 'monospace', fontSize: 11, marginTop: 3 },
  backFooter: { paddingTop: 8 },
  codeButton: { height: 39, borderRadius: radius.md, borderWidth: 1, borderColor: C.cyanBorder, backgroundColor: C.cyanSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  codeButtonText: { color: C.cyan, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2 },
});
