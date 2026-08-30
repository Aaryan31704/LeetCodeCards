import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, fonts, radius } from '../theme';

export default function MasteredButton({ mastered, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.btn, mastered && styles.on, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Ionicons
        name={mastered ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={17}
        color={mastered ? C.success : C.textSecondary}
      />
      <Text style={[styles.label, mastered && styles.labelOn]}>
        {mastered ? 'Mastered' : 'Mark mastered'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  on: { backgroundColor: C.successSoft, borderColor: C.success },
  label: { color: C.textSecondary, fontFamily: fonts.semiBold, fontSize: 13 },
  labelOn: { color: C.success },
});
