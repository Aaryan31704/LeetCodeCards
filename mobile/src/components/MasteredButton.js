import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { C, fonts, radius } from '../theme';

export default function MasteredButton({ mastered, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.btn, mastered && styles.on, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.label, mastered && styles.labelOn]}>
        {mastered ? 'Mastered' : 'Mark mastered'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  on: { backgroundColor: C.successBg, borderColor: C.success },
  label: { color: C.mid, fontFamily: fonts.semiBold, fontSize: 14 },
  labelOn: { color: C.success },
});
