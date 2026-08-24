import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { C, fonts } from '../theme';
import Screen from '../components/Screen';
import AppButton from '../components/AppButton';
import StatusView from '../components/StatusView';

const ERROR_MESSAGES = {
  token_exchange_failed: 'GitHub rejected the login. Check the OAuth client ID and secret.',
  no_access_token: 'GitHub did not return an access token. Check your OAuth app settings.',
  user_fetch_failed: 'Could not read your GitHub profile. Please try again.',
  invalid_user: 'GitHub returned an unexpected profile. Please try again.',
  access_denied: 'You cancelled the GitHub authorization.',
};

export default function LoginScreen() {
  const { login, loading } = useAuth();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setBusy(true);
    const result = await login();
    setBusy(false);
    if (result?.ok || result?.cancelled) return;
    setError(ERROR_MESSAGES[result?.error] || result?.error || 'Login failed. Please try again.');
  };

  if (loading) {
    return (
      <Screen bottomInset>
        <StatusView loading message="Loading…" />
      </Screen>
    );
  }

  return (
    <Screen bottomInset>
      <View style={styles.body}>
        <Text style={styles.brand}>LeetPlacards</Text>
        <Text style={styles.tagline}>
          Hunt the pattern. Flip to check. Your GitHub solutions become the deck.
        </Text>
        <AppButton
          title="Login with GitHub"
          onPress={handleLogin}
          loading={busy}
          style={styles.button}
        />
        {error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.hint}>API: {API_BASE_URL}</Text>
          </>
        ) : null}
        <Text style={styles.hint}>
          Authorize once, connect your repo, and every push becomes a card.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brand: {
    fontSize: 32,
    fontFamily: fonts.bold,
    color: C.dark,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: C.mid,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  button: { minWidth: 240, marginBottom: 20 },
  errorText: {
    color: C.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
  },
  hint: {
    color: C.light,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 21,
    fontFamily: fonts.regular,
  },
});
