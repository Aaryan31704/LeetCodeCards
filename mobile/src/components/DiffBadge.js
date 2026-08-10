import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, DIFF, fonts } from '../theme';

export default function DiffBadge({ difficulty }) {
  const d = (difficulty || 'Medium').toLowerCase();
  const s = DIFF[d] || DIFF.medium;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.label, { color: s.fg }]}>{difficulty || 'Medium'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  label: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.2 },
});
