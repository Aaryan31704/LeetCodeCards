import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { fetchPlacards, setAuthToken, syncNow } from '../api';
import { useAuth } from '../context/AuthContext';

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const DIFF_COLORS = { Easy: '#22c55e', Medium: '#eab308', Hard: '#ef4444' };

function PlacardCard({ item, onPress }) {
  const dc = DIFF_COLORS[item.difficulty] || '#eab308';
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.cardTopRow}>
        <Text style={styles.problemName} numberOfLines={2}>{item.problem_name}</Text>
        {item.mastered && <Text style={styles.masteredMark}>Mastered</Text>}
      </View>
      <View style={styles.meta}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={[styles.diffBadge, { borderColor: dc, backgroundColor: dc + '22' }]}>
            <Text style={{ color: dc, fontSize: 12, fontWeight: '600' }}>{item.difficulty || 'Medium'}</Text>
          </View>
          <View style={styles.patternBadge}>
            <Text style={styles.patternText}>{item.pattern || '—'}</Text>
          </View>
        </View>
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PlacardListScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();
  const [placards, setPlacards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      if (isRefresh) {
        await syncNow();
        await refreshUser();
      }
      const data = await fetchPlacards();
      setPlacards(data);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    setAuthToken(null);
    await logout();
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.hint}>Loading placards…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.hint}>Ensure the backend is running and API URL is correct.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {user?.username ? (
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>@{user.username}</Text>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <TouchableOpacity onPress={() => navigation.navigate('FlashcardDeck')}>
              <Text style={styles.deckLink}>Deck</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <FlatList
        data={placards}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PlacardCard
            item={item}
            onPress={(p) => navigation.navigate('PlacardView', { placardId: p.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor="#38bdf8"
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No placards yet</Text>
            <Text style={styles.hint}>
              Connect your LeetCode repo in Connect repo, or push new solutions—cards are created
              automatically when you push.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerText: { color: '#94a3b8', fontSize: 14 },
  deckLink: { color: '#38bdf8', fontSize: 14, fontWeight: '600' },
  logoutBtn: { padding: 0 },
  logoutText: { color: '#38bdf8', fontSize: 14 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  masteredMark: { color: '#22c55e', fontSize: 12, fontWeight: '600' },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  problemName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  patternBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  patternText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  date: {
    fontSize: 13,
    color: '#64748b',
  },
  hint: { color: '#94a3b8', marginTop: 8, textAlign: 'center' },
  errorText: { color: '#f87171', fontSize: 16, textAlign: 'center' },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  retryBtnText: { color: '#e2e8f0', fontWeight: '600' },
  empty: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { color: '#94a3b8', fontSize: 16 },
});
