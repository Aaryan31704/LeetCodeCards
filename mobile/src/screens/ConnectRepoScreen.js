import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useAuth, repoFromUser, userHasRepo } from '../context/AuthContext';
import { connectRepo, setAuthToken } from '../api';
import { C, fonts, radius } from '../theme';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import AppButton from '../components/AppButton';

export default function ConnectRepoScreen({ navigation }) {
  const { token, user, refreshUser, logout } = useAuth();
  const linked = repoFromUser(user);
  const alreadyLinked = userHasRepo(user);
  const [owner, setOwner] = useState(linked.owner);
  const [repo, setRepo] = useState(linked.name);
  const [prefix, setPrefix] = useState(linked.prefix);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  useEffect(() => {
    const r = repoFromUser(user);
    setOwner(r.owner);
    setRepo(r.name);
    setPrefix(r.prefix);
  }, [user]);

  const goToDeck = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Study' }] });
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Sign in again to use a different GitHub account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setAuthToken(null);
          await logout();
        },
      },
    ]);
  };

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
      const result = await connectRepo(o, r, prefix.trim());
      const updated = await refreshUser();
      if (!userHasRepo(updated)) {
        setError('Repo saved but the app could not refresh. Pull to refresh or restart the app.');
        return;
      }
      if (result && result.webhook_created === false) {
        Alert.alert(
          'Connected, but no webhook',
          'Your repo is linked and syncing now, but GitHub could not be given a webhook, so new pushes will not sync automatically. Use pull-to-refresh.',
          [{ text: 'OK', onPress: goToDeck }]
        );
        return;
      }
      goToDeck();
    } catch (e) {
      setError(e.message || 'Failed to connect repo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen bottomInset>
      <ScreenHeader
        title={alreadyLinked ? 'Change repo' : 'Connect repo'}
        subtitle={
          alreadyLinked
            ? `Currently ${linked.owner}/${linked.name}`
            : 'Link the GitHub repo where you push solutions'
        }
        onBack={alreadyLinked ? goToDeck : undefined}
        right={
          <TouchableOpacity onPress={handleLogout} hitSlop={8}>
            <Text style={styles.logout}>Log out</Text>
          </TouchableOpacity>
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.panel}>
            <Text style={styles.panelKicker}>REPOSITORY UPLINK</Text>
            <Text style={styles.hint}>
              {alreadyLinked
                ? 'Connecting a different repo replaces this deck with cards from the new one.'
                : 'Link the repository that receives your accepted LeetCode solutions.'}
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
            placeholder="Path prefix (leave blank if files are at repo root)"
            placeholderTextColor={C.light}
            value={prefix}
            onChangeText={setPrefix}
            autoCapitalize="none"
            />
            <Text style={styles.pathHint}>
              Leave blank for LeetHub folders such as 0001-two-sum. Set a prefix only when every solution is inside one folder.
            </Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <AppButton
              title={alreadyLinked ? 'Switch repository' : 'Initialize deck'}
              onPress={handleConnect}
              loading={submitting}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 48 },
  panel: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 20,
    padding: 18,
  },
  panelKicker: {
    color: C.cyan,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 10,
  },
  hint: {
    color: C.textSecondary,
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  input: {
    backgroundColor: C.surfaceDeep,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.glassBorder,
    fontFamily: fonts.regular,
  },
  pathHint: {
    color: C.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  errorText: {
    color: C.danger,
    marginBottom: 12,
    fontSize: 14,
    fontFamily: fonts.medium,
  },
  logout: { color: C.cyan, fontFamily: fonts.semiBold, fontSize: 14 },
});
