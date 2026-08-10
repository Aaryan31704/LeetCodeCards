import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';

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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.hint}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LeetPlacards</Text>
      <Text style={styles.subtitle}>
        Turn your LeetCode solutions into flashcards. Log in with GitHub and connect your repo—new
        solutions will become cards automatically when you push.
      </Text>
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleLogin}
        activeOpacity={0.8}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.buttonText}>Login with GitHub</Text>
        )}
      </TouchableOpacity>
      {error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>API: {API_BASE_URL}</Text>
        </>
      ) : null}
      <Text style={styles.hint}>
        You’ll be redirected to GitHub to authorize. After connecting your repo, every push will create
        or update placards.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  button: {
    backgroundColor: '#38bdf8',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 24,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '600',
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  hint: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
