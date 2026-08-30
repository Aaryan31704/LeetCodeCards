/** Shared dark-neon visual language for LeetPlacards. */

export const C = {
  bg: '#050816',
  bgSoft: '#090D21',
  surface: '#10182D',
  surfaceDeep: '#090E1E',
  surfaceViolet: '#17122E',
  card: '#10182D',
  cardBack: '#17122E',
  glass: 'rgba(17, 28, 51, 0.82)',
  glassBorder: 'rgba(148, 210, 255, 0.18)',
  primary: '#38D9FF',
  primarySoft: 'rgba(56, 217, 255, 0.10)',
  primaryDark: '#0EA5C6',
  cyan: '#38D9FF',
  cyanSoft: 'rgba(56, 217, 255, 0.10)',
  cyanBorder: 'rgba(56, 217, 255, 0.28)',
  cyanGlow: '#0E7490',
  violet: '#A78BFA',
  violetSoft: 'rgba(167, 139, 250, 0.10)',
  violetBorder: 'rgba(167, 139, 250, 0.28)',
  text: '#F4F8FF',
  textSecondary: '#B8C5D9',
  textMuted: '#6F809C',
  dark: '#F4F8FF',
  mid: '#B8C5D9',
  light: '#6F809C',
  muted: '#35435C',
  border: 'rgba(148, 210, 255, 0.15)',
  shadow: '#000000',
  easy: '#4ADE80',
  easyBg: 'rgba(74, 222, 128, 0.11)',
  medium: '#FBBF24',
  mediumBg: 'rgba(251, 191, 36, 0.11)',
  hard: '#FB7185',
  hardBg: 'rgba(251, 113, 133, 0.11)',
  success: '#34D399',
  successBg: 'rgba(52, 211, 153, 0.11)',
  successSoft: 'rgba(52, 211, 153, 0.11)',
  danger: '#FB7185',
  white: '#F8FAFC',
  codeBg: '#050914',
  codeText: '#D9E7FA',
};

export const fonts = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semiBold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  pill: 20,
};

export const shadow = {
  card: {
    shadowColor: C.cyan,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 8,
  },
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
