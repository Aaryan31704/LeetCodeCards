import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, fonts } from '../theme';

export default function ScreenHeader({ title, subtitle, right, onBack }) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={10} activeOpacity={0.7}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  backBtn: { paddingVertical: 4, paddingRight: 4 },
  backText: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 15 },
  titles: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: C.dark,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: C.light,
    marginTop: 2,
    fontFamily: fonts.medium,
  },
  right: { flexShrink: 0 },
});
