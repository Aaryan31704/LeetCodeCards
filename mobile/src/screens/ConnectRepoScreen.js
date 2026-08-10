import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { connectRepo, setAuthToken } from '../api';

export default function ConnectRepoScreen({ navigation }) {
  const { token, user, refreshUser } = useAuth();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [prefix, setPrefix] = useState('LeetCode');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  const hasRepo = user?.repo_owner && user?.repo_name;

  const handleConnect = async () => {
    const o = owner.trim();
    const r = repo.trim();
    if (!o || !r) {
      setError('Enter repo owner and name (e.g. your-username, leetcode-problems)');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await connectRepo(o, r, prefix.trim() || 'LeetCode');
      // Once the user has a repo, MainStack drops this screen and lands on the
      // deck automatically, so navigating here would target an unmounted route.
      const updated = await refreshUser();
      if (!updated?.repo_owner) {
        setError('Repo saved but the app could not refresh. Pull to refresh or restart the app.');
        setSubmitting(false);
        return;
      }
      if (result && result.webhook_created === false) {
        // Alert rather than local state: this screen unmounts as soon as the
        // refreshed user has a repo.
        Alert.alert(
          'Connected, but no webhook',
          'Your repo is connected and syncing now, but GitHub could not be given a ' +
            'webhook, so new pushes will not sync automatically. Use pull-to-refresh, ' +
            'or set APP_URL to a public backend URL.'
        );
      }
    } catch (e) {
      setError(e.message || 'Failed to connect repo');
      setSubmitting(false);
    }
  };

  if (hasRepo) {
    return (
      <View style={styles.container}>
        <Text style={styles.connected}>
          Connected: {user.repo_owner}/{user.repo_name}
        </Text>
        <Text style={styles.hint}>Placards sync when you push. Pull to refresh the list.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('PlacardList')}
        >
          <Text style={styles.buttonText}>View placards</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Connect your LeetCode repo</Text>
        <Text style={styles.hint}>
          Repository where you push LeetCode solutions (e.g. with LeetHub). We’ll create a webhook
          so new pushes create placards automatically.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Owner (e.g. your-username)"
          placeholderTextColor="#64748b"
          value={owner}
          onChangeText={(t) => { setOwner(t); setError(null); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Repo name (e.g. leetcode-problems)"
          placeholderTextColor="#64748b"
          value={repo}
          onChangeText={(t) => { setRepo(t); setError(null); }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Path prefix (default: LeetCode)"
          placeholderTextColor="#64748b"
          value={prefix}
          onChangeText={setPrefix}
          autoCapitalize="none"
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleConnect}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.buttonText}>Connect repo & sync</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22,
  },
  connected: {
    fontSize: 17,
    color: '#38bdf8',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#f1f5f9',
    marginBottom: 12,
  },
  errorText: { color: '#f87171', marginBottom: 12, fontSize: 14 },
  button: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#0f172a', fontSize: 17, fontWeight: '600' },
});
