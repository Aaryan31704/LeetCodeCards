/**
 * Shared visual language for LeetPlacards.
 * Light study surface with a cool blue accent — used by every screen.
 */

export const C = {
  bg: '#f1f5f9',
  bgSoft: '#e8eef6',
  card: '#ffffff',
  cardBack: '#f8faff',
  primary: '#4f6ef7',
  primarySoft: '#edf1ff',
  primaryDark: '#3b57d9',
  dark: '#0f172a',
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
  danger: '#ef4444',
  white: '#ffffff',
  codeBg: '#0f172a',
  codeText: '#e2e8f0',
};

export const fonts = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
};

export const DIFF = {
  easy: { bg: C.easyBg, fg: C.easy },
  medium: { bg: C.mediumBg, fg: C.medium },
  hard: { bg: C.hardBg, fg: C.hard },
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Prefer unmastered cards; mastereds appear much less often. */
export function studyOrder(cards, { hideMastered = false } = {}) {
  const unmastered = cards.filter((c) => !c.mastered);
  const mastered = cards.filter((c) => c.mastered);
  if (hideMastered) return shuffle(unmastered);
  // Interleave: mostly unmastered, occasional mastered for spaced review.
  const u = shuffle(unmastered);
  const m = shuffle(mastered);
  if (u.length === 0) return m;
  if (m.length === 0) return u;
  const out = [];
  let mi = 0;
  for (let i = 0; i < u.length; i++) {
    out.push(u[i]);
    if ((i + 1) % 5 === 0 && mi < m.length) {
      out.push(m[mi++]);
    }
  }
  while (mi < m.length) out.push(m[mi++]);
  return out;
}
