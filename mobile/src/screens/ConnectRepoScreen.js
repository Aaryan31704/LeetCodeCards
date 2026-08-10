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
import { C, fonts } from '../theme';

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
      const updated = await refreshUser();
      if (!updated?.repo_owner) {
        setError('Repo saved but the app could not refresh. Pull to refresh or restart the app.');
        setSubmitting(false);
        return;
      }
      if (result && result.webhook_created === false) {
        Alert.alert(
          'Connected, but no webhook',
          'Your repo is connected and syncing now, but GitHub could not be given a ' +
            'webhook, so new pushes will not sync automatically. Use pull-to-refresh.'
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
          onPress={() => navigation.navigate('FlashcardDeck')}
        >
          <Text style={styles.buttonText}>Open deck</Text>
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
          Repository where you push solutions (e.g. with LeetHub). We’ll create a webhook so new
          pushes become placards automatically.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Owner (e.g. your-username)"
          placeholderTextColor={C.light}
          value={owner}
          onChangeText={(t) => {
            setOwner(t);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Repo name (e.g. leetcode-problems)"
          placeholderTextColor={C.light}
          value={repo}
          onChangeText={(t) => {
            setRepo(t);
            setError(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="Path prefix (default: LeetCode)"
          placeholderTextColor={C.light}
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
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={styles.buttonText}>Connect repo & sync</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: C.dark,
    marginBottom: 12,
  },
  hint: {
    color: C.mid,
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  connected: {
    fontSize: 17,
    color: C.primary,
    marginBottom: 8,
    marginTop: 40,
    marginHorizontal: 24,
    fontFamily: fonts.semiBold,
  },
  input: {
    backgroundColor: C.white,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: C.dark,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    fontFamily: fonts.regular,
  },
  errorText: {
    color: C.danger,
    marginBottom: 12,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  button: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 24,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: C.white, fontSize: 17, fontFamily: fonts.semiBold },
});
