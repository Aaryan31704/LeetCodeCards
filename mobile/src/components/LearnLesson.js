import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DiffBadge from './DiffBadge';
import { C, fonts, radius } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Constraints and follow-ups matter, but reading them before the task itself
// is what made the problem feel unapproachable. They move behind "More detail".
const TAIL = /\n\s*(Constraints?|Follow[- ]?up)\s*:/i;
const HEADING = /^(Example\s*\d*|Constraints?|Follow[- ]?up)\s*:?\s*$/i;
const LITERAL = /^(Input|Output|Explanation)\b|^\s*[-\d[]/;

function hasText(value, minimum = 10) {
  return (value || '').trim().length >= minimum;
}

/** Split the official statement into the task and its trailing fine print. */
function splitStatement(text) {
  const clean = (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return { body: '', tail: '' };
  const match = TAIL.exec(clean);
  if (!match) return { body: clean, tail: '' };
  return {
    body: clean.slice(0, match.index).trim(),
    tail: clean.slice(match.index).trim(),
  };
}

/** Keep LeetCode's own paragraphs, setting sample data in a monospace face. */
function blocksFrom(text) {
  return (text || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((body) => ({
      body,
      heading: HEADING.test(body),
      literal: LITERAL.test(body),
    }));
}

function stepsFrom(value) {
  const text = (value || '').trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^(?:step\s*)?\d+[\).:\-]\s*/i, '').trim())
    .filter(Boolean);
}

const Prose = memo(function Prose({ text }) {
  const blocks = useMemo(() => blocksFrom(text), [text]);
  return blocks.map((block, index) => (
    <Text
      key={`${index}-${block.body.slice(0, 24)}`}
      style={[
        styles.copy,
        block.heading && styles.proseHeading,
        block.literal && styles.literal,
        index > 0 && styles.blockGap,
      ]}
    >
      {block.body}
    </Text>
  ));
});

const Block = memo(function Block({ label, children }) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
});

const Steps = memo(function Steps({ value, monospace = false }) {
  const steps = useMemo(() => stepsFrom(value), [value]);
  if (!steps.length) return null;
  return steps.map((step, index) => (
    <View style={styles.step} key={`${index}-${step.slice(0, 24)}`}>
      <Text style={styles.stepNumber}>{index + 1}</Text>
      <Text style={[styles.stepText, monospace && styles.mono]}>{step}</Text>
    </View>
  ));
});

const Cost = memo(function Cost({ time, space }) {
  if (!time && !space) return null;
  return (
    <Text style={styles.cost}>
      {`Time ${time || '—'}   ·   Space ${space || '—'}`}
    </Text>
  );
});

function LearnLesson({ card, onShowCode }) {
  const [revealed, setRevealed] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const { body, tail } = useMemo(() => splitStatement(card.statement), [card.statement]);
  const recommended = card.better_approach || card.approach;
  const isOptimal = (card.optimization_verdict || '').startsWith('Already optimal');
  const fallback = card.description || card.plain_explanation;
  const gist = body ? card.plain_explanation : '';
  const extras = tail || hasText(card.naive_approach) || hasText(card.pseudocode);

  // A new problem has to start unsolved, or the answer is already on screen.
  useEffect(() => {
    setRevealed(false);
    setDetailed(false);
  }, [card.id]);

  const open = (setter) => () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(true);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.lesson}>
        <DiffBadge difficulty={card.difficulty} />
        <Text style={styles.title}>{card.problem_name}</Text>
        {gist ? <Text style={styles.gist}>{gist}</Text> : null}

        <View style={styles.statement}>
          {body || fallback ? (
            <Prose text={body || fallback} />
          ) : (
            <Text style={styles.missing}>
              This problem is still being fetched. Resync from the menu to finish it.
            </Text>
          )}
          {!body && hasText(card.example, 4) ? (
            <Text style={[styles.copy, styles.literal, styles.blockGap]}>{card.example}</Text>
          ) : null}
        </View>

        {revealed ? null : (
          <TouchableOpacity style={styles.reveal} onPress={open(setRevealed)} activeOpacity={0.85}>
            <Text style={styles.revealTitle}>Reveal the walkthrough</Text>
            <Text style={styles.revealHint}>Sketch your own approach first — it sticks better.</Text>
          </TouchableOpacity>
        )}

        {revealed ? (
          <>
            <Block label="Worked example">
              {hasText(card.dry_run) ? (
                <Steps value={card.dry_run} />
              ) : (
                <Text style={styles.missing}>A worked example is queued for generation.</Text>
              )}
            </Block>

            <Block label="The idea">
              <Text style={styles.copy}>
                {card.core_insight || 'The key observation is queued for generation.'}
              </Text>
              {hasText(card.invariant) ? (
                <Text style={[styles.copy, styles.blockGap]}>
                  <Text style={styles.inlineLabel}>Always true: </Text>
                  {card.invariant}
                </Text>
              ) : null}
            </Block>

            <Block label="Your solution">
              {card.optimization_verdict ? (
                <View style={styles.verdict}>
                  <Ionicons
                    name={isOptimal ? 'checkmark-circle' : 'trending-up'}
                    size={15}
                    color={isOptimal ? C.success : C.medium}
                  />
                  <Text
                    style={[styles.verdictText, { color: isOptimal ? C.success : C.medium }]}
                  >
                    {card.optimization_verdict}
                  </Text>
                </View>
              ) : null}
              {hasText(card.user_approach) ? (
                <Steps value={card.user_approach} />
              ) : (
                <Text style={styles.missing}>Your code is queued for analysis.</Text>
              )}
              <Cost time={card.user_time_complexity} space={card.user_space_complexity} />
            </Block>

            {isOptimal && !card.better_approach ? null : (
              <Block label={card.better_approach ? 'A faster approach' : 'Recommended approach'}>
                {hasText(recommended) ? (
                  <Steps value={recommended} />
                ) : (
                  <Text style={styles.missing}>The recommended approach is queued.</Text>
                )}
                {card.better_approach ? (
                  <Cost time={card.better_time_complexity} space={card.better_space_complexity} />
                ) : null}
              </Block>
            )}

            {extras && !detailed ? (
              <TouchableOpacity style={styles.more} onPress={open(setDetailed)} activeOpacity={0.7}>
                <Text style={styles.moreText}>More detail</Text>
                <Ionicons name="chevron-down" size={15} color={C.textMuted} />
              </TouchableOpacity>
            ) : null}

            {detailed ? (
              <>
                {hasText(card.naive_approach) ? (
                  <Block label="The obvious approach">
                    <Text style={styles.copy}>{card.naive_approach}</Text>
                  </Block>
                ) : null}
                {hasText(card.pseudocode) ? (
                  <Block label="Pseudocode">
                    <Steps value={card.pseudocode} monospace />
                  </Block>
                ) : null}
                {tail ? (
                  <Block label="Constraints">
                    <Prose text={tail} />
                  </Block>
                ) : null}
              </>
            ) : null}

            <TouchableOpacity style={styles.codeButton} onPress={onShowCode} activeOpacity={0.7}>
              <Ionicons name="code-slash" size={16} color={C.cyan} />
              <Text style={styles.codeText}>Open your submitted code</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

export default memo(LearnLesson);

const styles = StyleSheet.create({
  scroll: { flex: 1, width: '100%' },
  scrollContent: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  lesson: { width: '100%', maxWidth: 680 },

  title: { color: C.text, fontFamily: fonts.bold, fontSize: 24, lineHeight: 31, marginTop: 12 },
  gist: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 6 },
  statement: { marginTop: 18 },

  block: { marginTop: 26 },
  label: {
    color: C.textMuted,
    fontFamily: fonts.semiBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  copy: { color: C.textSecondary, fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
  proseHeading: { color: C.text, fontFamily: fonts.semiBold },
  literal: { fontFamily: 'monospace', fontSize: 13, lineHeight: 21, color: C.codeText },
  blockGap: { marginTop: 12 },
  inlineLabel: { color: C.textMuted, fontFamily: fonts.semiBold },
  missing: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, fontStyle: 'italic' },

  reveal: {
    marginTop: 28,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: C.cyanSoft,
    borderWidth: 1,
    borderColor: C.cyanBorder,
  },
  revealTitle: { color: C.cyan, fontFamily: fonts.semiBold, fontSize: 15 },
  revealHint: { color: C.textMuted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },

  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  stepNumber: {
    color: C.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 23,
    minWidth: 14,
  },
  stepText: { flex: 1, color: C.textSecondary, fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  mono: { fontFamily: 'monospace', fontSize: 13, color: C.codeText },

  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 12 },
  verdictText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  cost: { color: C.textMuted, fontFamily: 'monospace', fontSize: 12, marginTop: 4 },

  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 26,
    paddingVertical: 4,
  },
  moreText: { color: C.textMuted, fontFamily: fonts.semiBold, fontSize: 13 },

  codeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 28,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: C.glassBorder,
  },
  codeText: { color: C.cyan, fontFamily: fonts.semiBold, fontSize: 14 },
});
