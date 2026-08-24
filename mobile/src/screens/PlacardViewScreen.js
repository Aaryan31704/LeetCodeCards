import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { fetchPlacardById, toggleMastered } from '../api';
import FlipCard from '../components/FlipCard';
import CodeModal from '../components/CodeModal';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import StatusView from '../components/StatusView';
import MasteredButton from '../components/MasteredButton';
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
        if (!cancelled) setPlacard(data);
      } catch (_) {
        if (!cancelled) setPlacard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [placardId]);

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
      <Screen bottomInset>
        <ScreenHeader title="Card" onBack={() => navigation.goBack()} />
        <StatusView loading />
      </Screen>
    );
  }

  if (!placard) {
    return (
      <Screen bottomInset>
        <ScreenHeader title="Card" onBack={() => navigation.goBack()} />
        <StatusView error="Placard not found" onRetry={() => navigation.goBack()} retryLabel="Go back" />
      </Screen>
    );
  }

  return (
    <Screen bottomInset>
      <CodeModal
        visible={codeVisible}
        code={placard.code}
        onClose={() => setCodeVisible(false)}
      />
      <ScreenHeader
        title={placard.problem_name || 'Card'}
        subtitle="Flip to hunt the pattern"
        onBack={() => navigation.goBack()}
      />
      <View style={styles.deck}>
        <FlipCard
          card={placard}
          onShowCode={() => setCodeVisible(true)}
          compact
        />
      </View>
      <View style={styles.footer}>
        <MasteredButton mastered={placard.mastered} onPress={handleMastered} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  deck: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
});
