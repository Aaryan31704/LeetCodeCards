import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, fonts, radius } from '../theme';

const MODES = [
  { id: 'learn', label: 'LEARN', icon: 'school-outline' },
  { id: 'review', label: 'REVIEW', icon: 'flash-outline' },
];

function StudyModeToggle({ value, onChange }) {
  return (
    <View style={styles.wrap}>
      {MODES.map((mode) => {
        const active = value === mode.id;
        return (
          <TouchableOpacity
            key={mode.id}
            style={[styles.option, active && styles.active]}
            onPress={() => onChange(mode.id)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Ionicons
              name={mode.icon}
              size={15}
              color={active ? C.bg : C.textMuted}
            />
            <Text style={[styles.label, active && styles.activeLabel]}>{mode.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default memo(StudyModeToggle);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '70%',
    maxWidth: 340,
    minWidth: 240,
    padding: 4,
    marginTop: 7,
    marginBottom: 3,
    borderRadius: radius.md,
    backgroundColor: C.surfaceDeep,
    borderWidth: 1,
    borderColor: C.glassBorder,
  },
  option: {
    flex: 1,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
  },
  active: {
    backgroundColor: C.cyan,
    shadowColor: C.cyan,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  label: { color: C.textMuted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  activeLabel: { color: C.bg },
});
