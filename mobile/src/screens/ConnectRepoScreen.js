import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { connectRepo, setAuthToken } from '../api';
import { C, fonts, radius } from '../theme';
import Screen from '../components/Screen';
import ScreenHeader from '../components/ScreenHeader';
import AppButton from '../components/AppButton';

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
      <Screen bottomInset>
        <ScreenHeader
          title="Connected"
          subtitle={`${user.repo_owner}/${user.repo_name}`}
        />
        <View style={styles.body}>
          <Text style={styles.hint}>Placards sync when you push. Pull to refresh the list.</Text>
          <AppButton
            title="Open deck"
            onPress={() => navigation.navigate('MainTabs')}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen bottomInset>
      <ScreenHeader
        title="Connect repo"
        subtitle="Link the GitHub repo where you push solutions"
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.hint}>
            We’ll create a webhook so new pushes become placards automatically (e.g. LeetHub).
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
          <AppButton
            title="Connect repo & sync"
            onPress={handleConnect}
            loading={submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: 20, paddingTop: 8 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 48 },
  hint: {
    color: C.mid,
    fontSize: 15,
    marginBottom: 20,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  input: {
    backgroundColor: C.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
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
});
