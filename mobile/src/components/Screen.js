import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';

export default function Screen({ children, style, bottomInset = false }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[C.bg, '#09112A', C.bg]}
      locations={[0, 0.52, 1]}
      style={[
        styles.root,
        { paddingTop: insets.top, paddingBottom: bottomInset ? insets.bottom : 0 },
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.orb, styles.orbCyan]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbViolet]} />
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
  orb: { position: 'absolute', width: 220, height: 220, borderRadius: 110, opacity: 0.12 },
  orbCyan: { backgroundColor: C.cyan, top: -100, right: -90 },
  orbViolet: { backgroundColor: C.violet, bottom: -120, left: -90 },
});
