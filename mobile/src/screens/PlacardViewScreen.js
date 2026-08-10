import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { fetchPlacardById, toggleMastered } from '../api';
import FlipCard from '../components/FlipCard';
import CodeModal from '../components/CodeModal';
import { C, fonts } from '../theme';
import * as Haptics from 'expo-haptics';

export default function PlacardViewScreen({ route, navigation }) {
  const { placardId } = route.params;
  const [placard, setPlacard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [codeVisible, setCodeVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchPlacardById(placardId);
        if (!cancelled) {
          setPlacard(data);
          navigation.setOptions({ title: data.problem_name || 'Placard' });
        }
      } catch (_) {
        if (!cancelled) setPlacard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placardId, navigation]);

  const handleMastered = async () => {
    if (!placard) return;
    try {
      const res = await toggleMastered(placard.id);
      Haptics.notificationAsync(
        res.mastered
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      ).catch(() => {});
      setPlacard((p) => ({ ...p, mastered: res.mastered }));
    } catch (_) {}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!placard) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Placard not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CodeModal
        visible={codeVisible}
        code={placard.code}
        onClose={() => setCodeVisible(false)}
      />
      <View style={styles.deck}>
        <FlipCard
          card={placard}
          onShowCode={() => setCodeVisible(true)}
          compact
        />
      </View>
      <TouchableOpacity
        style={[styles.masteredBtn, placard.mastered && styles.masteredBtnOn]}
        onPress={handleMastered}
        activeOpacity={0.8}
      >
        <Text style={[styles.masteredLabel, placard.mastered && styles.masteredLabelOn]}>
          {placard.mastered ? '✓ Mastered' : 'Mark Mastered'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 16,
    paddingBottom: 28,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  deck: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: C.danger, fontSize: 16, fontFamily: fonts.semiBold },
  masteredBtn: {
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  masteredBtnOn: { backgroundColor: C.successBg, borderColor: C.success },
  masteredLabel: { color: C.mid, fontFamily: fonts.semiBold, fontSize: 15 },
  masteredLabelOn: { color: C.success },
});
