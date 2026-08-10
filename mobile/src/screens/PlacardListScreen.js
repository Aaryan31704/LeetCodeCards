import React, { useEffect, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { fetchPlacards, setAuthToken, syncNow } from '../api';
import { useAuth } from '../context/AuthContext';
import DiffBadge from '../components/DiffBadge';
import { C, fonts } from '../theme';

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function PlacardRow({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
      <View style={styles.cardTopRow}>
        <Text style={styles.problemName} numberOfLines={2}>
          {item.problem_name}
        </Text>
        {item.mastered ? <Text style={styles.masteredMark}>Mastered</Text> : null}
      </View>
      <View style={styles.meta}>
        <View style={styles.metaLeft}>
          <DiffBadge difficulty={item.difficulty} />
          {item.pattern ? (
            <View style={styles.patternBadge}>
              <Text style={styles.patternText} numberOfLines={1}>
                {item.pattern}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PlacardListScreen({ navigation }) {
  const { user, logout, refreshUser } = useAuth();
  const [placards, setPlacards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [diffFilter, setDiffFilter] = useState('All');
  const [patternFilter, setPatternFilter] = useState('All');

  const handleLogout = useCallback(async () => {
    setAuthToken(null);
    await logout();
  }, [logout]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => navigation.navigate('FlashcardDeck')} style={styles.headerBtn}>
            <Text style={styles.headerLink}>Deck</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
            <Text style={styles.headerLinkMuted}>Log out</Text>
          </TouchableOpacity>
        </View>
      ),
      headerTitle: user?.username ? `@${user.username}` : 'All Placards',
    });
  }, [navigation, user, handleLogout]);

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

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patterns = useMemo(() => {
    const set = new Set();
    placards.forEach((p) => {
      if (p.pattern && p.pattern !== '—') set.add(p.pattern);
    });
    return ['All', ...Array.from(set).sort()];
  }, [placards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return placards.filter((p) => {
      if (diffFilter !== 'All' && (p.difficulty || 'Medium') !== diffFilter) return false;
      if (patternFilter !== 'All' && p.pattern !== patternFilter) return false;
      if (!q) return true;
      return (
        (p.problem_name || '').toLowerCase().includes(q) ||
        (p.pattern || '').toLowerCase().includes(q)
      );
    });
  }, [placards, query, diffFilter, patternFilter]);

  const mastered = placards.filter((p) => p.mastered).length;
  const patternCount = new Set(
    placards.map((p) => p.pattern).filter((p) => p && p !== '—')
  ).size;
  const progress = placards.length ? mastered / placards.length : 0;

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.hint}>Loading placards…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.hint}>Pull to retry, or check that the API is reachable.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.stats}>
        <Text style={styles.statsTitle}>
          {placards.length} cards · {mastered} mastered · {patternCount} patterns
        </Text>
        <View style={styles.statsTrack}>
          <View style={[styles.statsFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search problems or patterns…"
          placeholderTextColor={C.light}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {['All', 'Easy', 'Medium', 'Hard'].map((d) => (
          <Chip
            key={d}
            label={d}
            active={diffFilter === d}
            onPress={() => setDiffFilter(d)}
          />
        ))}
        <View style={styles.chipDivider} />
        {patterns.slice(0, 12).map((p) => (
          <Chip
            key={p}
            label={p === 'All' ? 'All patterns' : p}
            active={patternFilter === p}
            onPress={() => setPatternFilter(p)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PlacardRow
            item={item}
            onPress={(p) => navigation.navigate('PlacardView', { placardId: p.id })}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={C.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {placards.length === 0 ? 'No placards yet' : 'No matches'}
            </Text>
            <Text style={styles.hint}>
              {placards.length === 0
                ? 'Push LeetCode solutions to your connected repo — cards appear automatically.'
                : 'Try a different search or filter.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginRight: 4 },
  headerBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  headerLink: { color: C.primary, fontFamily: fonts.semiBold, fontSize: 15 },
  headerLinkMuted: { color: C.mid, fontFamily: fonts.medium, fontSize: 14 },

  stats: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  statsTitle: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: C.mid,
    marginBottom: 10,
  },
  statsTrack: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  statsFill: { height: '100%', backgroundColor: C.success, borderRadius: 3 },

  searchWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  search: {
    backgroundColor: C.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: C.dark,
    borderWidth: 1,
    borderColor: C.border,
  },

  chipsScroll: { maxHeight: 48, marginTop: 4 },
  chips: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 12, fontFamily: fonts.semiBold, color: C.mid },
  chipTextActive: { color: C.white },
  chipDivider: { width: 1, height: 20, backgroundColor: C.border, marginHorizontal: 4 },

  listContent: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
    padding: 24,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  problemName: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: C.dark,
  },
  masteredMark: {
    color: C.success,
    fontSize: 12,
    fontFamily: fonts.semiBold,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaLeft: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  patternBadge: {
    backgroundColor: C.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 140,
  },
  patternText: { fontSize: 12, fontFamily: fonts.medium, color: C.primary },
  date: { fontSize: 12, fontFamily: fonts.regular, color: C.light },
  hint: {
    color: C.light,
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.regular,
    lineHeight: 20,
  },
  errorText: {
    color: C.danger,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: C.primary,
    borderRadius: 10,
  },
  retryBtnText: { color: C.white, fontFamily: fonts.semiBold },
  empty: { paddingVertical: 48, alignItems: 'center', paddingHorizontal: 24 },
  emptyText: { color: C.dark, fontSize: 16, fontFamily: fonts.semiBold },
});
