import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DiffBadge from './DiffBadge';
import { C, fonts, radius } from '../theme';

function hasText(value, minimum = 10) {
  return (value || '').trim().length >= minimum;
}

function stepsFrom(value) {
  const text = (value || '').trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^(?:step\s*)?\d+[\).:\-]\s*/i, '').trim())
    .filter(Boolean);
}

const Section = memo(function Section({
  icon,
  label,
  title,
  accent = C.cyan,
  children,
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { borderColor: accent }]}>
          <Ionicons name={icon} size={16} color={accent} />
        </View>
        <View style={styles.sectionHeading}>
          <Text style={[styles.kicker, { color: accent }]}>{label}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      </View>
      {children}
    </View>
  );
});

const StepList = memo(function StepList({ value, accent = C.cyan, monospace = false }) {
  const steps = useMemo(() => stepsFrom(value), [value]);
  if (!steps.length) return null;
  return steps.map((step, index) => (
    <View style={styles.step} key={`${index}-${step.slice(0, 24)}`}>
      <View style={[styles.stepDot, { borderColor: accent }]}>
        <Text style={[styles.stepNumber, { color: accent }]}>{index + 1}</Text>
      </View>
      <Text style={[styles.stepText, monospace && styles.mono]}>{step}</Text>
    </View>
  ));
});

function LearnLesson({ card, onShowCode }) {
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const recommended = card.better_approach || card.approach;
  const isOptimal = (card.optimization_verdict || '').startsWith('Already optimal');
  const problemCopy = card.plain_explanation || card.description;
  const trace = card.dry_run || card.example;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
    >
      <View style={[styles.lesson, compact && styles.lessonCompact]}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <DiffBadge difficulty={card.difficulty} />
            <Text style={styles.lessonTag}>GUIDED LESSON</Text>
          </View>
          <Text style={styles.problemTitle}>{card.problem_name}</Text>
          <Text style={styles.heroHint}>Understand it first. Memorize it later.</Text>
          <View style={styles.roadmap}>
            {['UNDERSTAND', 'TRACE', 'COMPARE'].map((item, index) => (
              <View style={styles.roadmapItem} key={item}>
                <Text style={styles.roadmapNumber}>{index + 1}</Text>
                <Text style={styles.roadmapText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <Section icon="chatbubble-ellipses-outline" label="START HERE" title="The problem, simply">
          <Text style={styles.copy}>
            {problemCopy || 'This explanation is still being generated. Run Resync to complete the lesson.'}
          </Text>
        </Section>

        <Section icon="play-forward-outline" label="MAKE IT CONCRETE" title="Watch one input move">
          {hasText(trace) ? (
            card.dry_run ? (
              <StepList value={trace} accent={C.violet} />
            ) : (
              <Text style={styles.exampleText}>{trace}</Text>
            )
          ) : (
            <Text style={styles.missing}>A worked example is queued for generation.</Text>
          )}
        </Section>

        {hasText(card.naive_approach) ? (
          <Section icon="footsteps-outline" label="FIRST INSTINCT" title="The obvious approach">
            <Text style={styles.copy}>{card.naive_approach}</Text>
          </Section>
        ) : null}

        <Section icon="bulb-outline" label="THE UNLOCK" title="The key observation" accent={C.violet}>
          <Text style={styles.copy}>
            {card.core_insight || 'The key observation is queued for generation.'}
          </Text>
          {hasText(card.invariant) ? (
            <View style={styles.invariant}>
              <Text style={styles.invariantLabel}>KEEP THIS TRUE</Text>
              <Text style={styles.invariantText}>{card.invariant}</Text>
            </View>
          ) : null}
        </Section>

        <Section icon="person-outline" label="YOUR SUBMISSION" title="What your code does" accent={C.violet}>
          {hasText(card.user_approach) ? (
            <StepList value={card.user_approach} accent={C.violet} />
          ) : (
            <Text style={styles.missing}>Your submitted code is queued for analysis.</Text>
          )}
          {(card.user_time_complexity || card.user_space_complexity) ? (
            <View style={styles.complexityRow}>
              <Text style={styles.complexity}>TIME  {card.user_time_complexity || '—'}</Text>
              <Text style={styles.complexity}>SPACE  {card.user_space_complexity || '—'}</Text>
            </View>
          ) : null}
          {card.optimization_verdict ? (
            <View style={[styles.verdict, isOptimal ? styles.optimal : styles.improvable]}>
              <Ionicons
                name={isOptimal ? 'checkmark-circle-outline' : 'trending-up-outline'}
                size={17}
                color={isOptimal ? C.success : C.medium}
              />
              <Text style={[styles.verdictText, { color: isOptimal ? C.success : C.medium }]}>
                {card.optimization_verdict}
              </Text>
            </View>
          ) : null}
        </Section>

        <Section
          icon={card.better_approach ? 'trending-up-outline' : 'git-network-outline'}
          label={card.better_approach ? 'IMPROVEMENT' : 'TEXTBOOK VERSION'}
          title={card.better_approach ? 'A better approach' : 'The recommended approach'}
        >
          {hasText(recommended) ? (
            <StepList value={recommended} />
          ) : (
            <Text style={styles.missing}>The recommended approach is queued for generation.</Text>
          )}
          {card.better_approach && (card.better_time_complexity || card.better_space_complexity) ? (
            <View style={styles.complexityRow}>
              <Text style={styles.complexity}>TIME  {card.better_time_complexity || '—'}</Text>
              <Text style={styles.complexity}>SPACE  {card.better_space_complexity || '—'}</Text>
            </View>
          ) : null}
        </Section>

        {hasText(card.pseudocode) ? (
          <Section icon="list-outline" label="MENTAL TEMPLATE" title="Pseudocode">
            <View style={styles.pseudocode}>
              <StepList value={card.pseudocode} monospace />
            </View>
          </Section>
        ) : null}

        <TouchableOpacity style={styles.codeButton} onPress={onShowCode} activeOpacity={0.8}>
          <Ionicons name="code-slash" size={18} color={C.cyan} />
          <View style={styles.codeCopy}>
            <Text style={styles.codeTitle}>Open your submitted code</Text>
            <Text style={styles.codeHint}>Connect the lesson back to your implementation</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

export default memo(LearnLesson);

const styles = StyleSheet.create({
  scroll: { flex: 1, width: '100%' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 28 },
  lesson: { width: '100%', maxWidth: 680, gap: 12 },
  lessonCompact: { paddingHorizontal: 0 },
  hero: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: radius.xl,
    padding: 18,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lessonTag: { color: C.violet, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.6 },
  problemTitle: { color: C.text, fontFamily: fonts.bold, fontSize: 25, lineHeight: 31, marginTop: 13 },
  heroHint: { color: C.textMuted, fontFamily: fonts.medium, fontSize: 13, marginTop: 5 },
  roadmap: { flexDirection: 'row', gap: 7, marginTop: 16 },
  roadmapItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: C.surfaceDeep,
  },
  roadmapNumber: { color: C.cyan, fontFamily: 'monospace', fontSize: 10 },
  roadmapText: { color: C.textSecondary, fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.7 },
  section: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: radius.lg,
    padding: 16,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 13 },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceDeep,
  },
  sectionHeading: { flex: 1 },
  kicker: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.5, marginBottom: 2 },
  sectionTitle: { color: C.text, fontFamily: fonts.bold, fontSize: 17 },
  copy: { color: C.textSecondary, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  missing: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
  exampleText: {
    color: C.codeText,
    backgroundColor: C.codeBg,
    borderRadius: radius.md,
    padding: 13,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 21,
  },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 11 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: C.surfaceDeep,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumber: { fontFamily: fonts.bold, fontSize: 10 },
  stepText: { flex: 1, color: C.textSecondary, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  mono: { fontFamily: 'monospace', color: C.codeText, fontSize: 13 },
  invariant: {
    marginTop: 13,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: C.violetSoft,
    borderLeftWidth: 3,
    borderLeftColor: C.violet,
  },
  invariantLabel: { color: C.violet, fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.4, marginBottom: 5 },
  invariantText: { color: C.textSecondary, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  complexityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 },
  complexity: {
    color: C.cyan,
    backgroundColor: C.cyanSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 9,
    paddingVertical: 6,
    fontFamily: 'monospace',
    fontSize: 10,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 11,
    marginTop: 11,
  },
  optimal: { backgroundColor: C.successSoft, borderColor: C.success },
  improvable: { backgroundColor: C.mediumBg, borderColor: C.medium },
  verdictText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  pseudocode: { backgroundColor: C.codeBg, borderRadius: radius.md, padding: 12 },
  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 15,
    borderRadius: radius.lg,
    backgroundColor: C.cyanSoft,
    borderWidth: 1,
    borderColor: C.cyanBorder,
  },
  codeCopy: { flex: 1 },
  codeTitle: { color: C.cyan, fontFamily: fonts.bold, fontSize: 14 },
  codeHint: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
});
