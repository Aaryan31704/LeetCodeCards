import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { C, fonts, radius } from '../theme';

export default function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}) {
  const dimmed = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], styles[`${size}Size`], dimmed && styles.disabled, style]}
      onPress={onPress}
      disabled={dimmed}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? C.bg : C.primary} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`], styles[`${size}Text`]]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primary: {
    backgroundColor: C.cyan,
    borderColor: '#8BEAFF',
    shadowColor: C.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  secondary: {
    backgroundColor: C.glass,
    borderColor: C.glassBorder,
  },
  soft: { backgroundColor: C.cyanSoft, borderColor: C.cyanBorder },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  primaryText: { color: C.bg },
  secondaryText: { color: C.text },
  softText: { color: C.cyan },
  ghostText: { color: C.cyan },
  mdSize: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: radius.md,
  },
  smSize: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  text: { fontFamily: fonts.semiBold },
  mdText: { fontSize: 15 },
  smText: { fontSize: 12 },
  disabled: { opacity: 0.5 },
});
