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
        <ActivityIndicator color={variant === 'primary' ? C.white : C.primary} />
      ) : (
        <Text style={[styles.text, styles[`${variant}Text`], styles[`${size}Text`]]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: C.primary },
  secondary: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  soft: { backgroundColor: C.primarySoft },
  ghost: { backgroundColor: 'transparent' },
  primaryText: { color: C.white },
  secondaryText: { color: C.dark },
  softText: { color: C.primary },
  ghostText: { color: C.primary },
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
