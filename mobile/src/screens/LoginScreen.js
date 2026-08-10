import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../config';
import { C, fonts } from '../theme';

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
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.hint}>Loading…</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={[C.bgSoft, C.bg, '#dde7f5']} style={styles.container}>
      <Text style={styles.brand}>LeetPlacards</Text>
      <Text style={styles.tagline}>
        Your LeetCode solutions, turned into flashcards for revision.
      </Text>
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleLogin}
        activeOpacity={0.85}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={C.white} />
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
        Authorize once, connect your repo, and every push becomes a card.
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.bg,
  },
  brand: {
    fontSize: 36,
    fontFamily: fonts.bold,
    color: C.dark,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  tagline: {
    fontSize: 17,
    fontFamily: fonts.regular,
    color: C.mid,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 36,
    paddingHorizontal: 12,
  },
  button: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
    marginBottom: 20,
    minWidth: 240,
    alignItems: 'center',
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: C.white,
    fontSize: 17,
    fontFamily: fonts.semiBold,
  },
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
