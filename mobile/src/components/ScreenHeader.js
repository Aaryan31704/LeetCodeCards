import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, fonts } from '../theme';

export default function ScreenHeader({ title, subtitle, right, onBack }) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={10} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={19} color={C.cyan} />
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
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cyanSoft,
    borderWidth: 1,
    borderColor: C.cyanBorder,
  },
  titles: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 21,
    fontFamily: fonts.bold,
    color: C.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
    fontFamily: fonts.medium,
  },
  right: { flexShrink: 0 },
});
