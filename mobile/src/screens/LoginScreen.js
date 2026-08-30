import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
        <View style={styles.logoOrb}>
          <Ionicons name="layers" size={32} color={C.cyan} />
        </View>
        <Text style={styles.kicker}>ALGORITHM MEMORY SYSTEM</Text>
        <Text style={styles.brand}>LeetPlacards</Text>
        <Text style={styles.tagline}>
          Turn solved code into pattern recognition. Your GitHub becomes a living interview deck.
        </Text>
        <AppButton
          title="Connect GitHub"
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
          Secure OAuth · read your chosen repository · keep every push in sync
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
  logoOrb: {
    width: 74,
    height: 74,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.cyanSoft,
    borderWidth: 1,
    borderColor: C.cyanBorder,
    shadowColor: C.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 9,
    marginBottom: 22,
  },
  kicker: {
    color: C.cyan,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2.2,
    marginBottom: 9,
  },
  brand: {
    fontSize: 38,
    fontFamily: fonts.bold,
    color: C.text,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  tagline: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  button: { minWidth: 250, marginBottom: 20 },
  errorText: {
    color: C.danger,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    fontFamily: fonts.medium,
  },
  hint: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 21,
    fontFamily: fonts.regular,
  },
});
