import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { fetchPlacardById } from '../api';

export default function PlacardViewScreen({ route }) {
  const { placardId } = route.params;
  const [placard, setPlacard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);
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
    return () => { cancelled = true; };
  }, [placardId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
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
      <TouchableOpacity
        style={styles.card}
        activeOpacity={1}
        onPress={() => setFlipped((f) => !f)}
      >
        {!flipped ? (
          <>
            <Text style={styles.frontTitle}>{placard.problem_name}</Text>
            <View style={styles.patternBadge}>
              <Text style={styles.patternText}>{placard.pattern || '—'}</Text>
            </View>
            <Text style={styles.tapHint}>Tap to flip</Text>
          </>
        ) : (
          <ScrollView
            style={styles.backScroll}
            contentContainerStyle={styles.backContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.backLabel}>Summary</Text>
            <Text style={styles.backText}>{placard.summary || '—'}</Text>
            <Text style={styles.backLabel}>Approach</Text>
            <Text style={styles.backText}>{placard.approach || '—'}</Text>
            <Text style={styles.backLabel}>Time</Text>
            <Text style={styles.backText}>{placard.time_complexity || '—'}</Text>
            <Text style={styles.backLabel}>Space</Text>
            <Text style={styles.backText}>{placard.space_complexity || '—'}</Text>
            <Text style={styles.tapHint}>Tap to flip back</Text>
          </ScrollView>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.viewCodeBtn}
        onPress={() => setCodeVisible(true)}
      >
        <Text style={styles.viewCodeBtnText}>View Code</Text>
      </TouchableOpacity>

      <Modal
        visible={codeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCodeVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCodeVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Code</Text>
              <TouchableOpacity onPress={() => setCodeVisible(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.codeScroll}
              contentContainerStyle={styles.codeContent}
              showsVerticalScrollIndicator
            >
              <Text style={styles.codeText}>{placard.code || 'No code stored.'}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  card: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    justifyContent: 'center',
    minHeight: 280,
  },
  frontTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    textAlign: 'center',
  },
  patternBadge: {
    alignSelf: 'center',
    backgroundColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  patternText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  tapHint: {
    marginTop: 24,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  backScroll: { flex: 1 },
  backContent: { paddingBottom: 24 },
  backLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  backText: {
    fontSize: 15,
    color: '#e2e8f0',
    lineHeight: 22,
  },
  errorText: { color: '#f87171', fontSize: 16 },
  viewCodeBtn: {
    marginTop: 16,
    backgroundColor: '#334155',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewCodeBtnText: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: { color: '#f1f5f9', fontWeight: '600', fontSize: 18 },
  modalClose: { color: '#38bdf8', fontSize: 16 },
  codeScroll: { maxHeight: 400 },
  codeContent: { padding: 16 },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#94a3b8',
  },
});
