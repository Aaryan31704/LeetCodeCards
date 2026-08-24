import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { C, fonts } from '../theme';
import AppButton from './AppButton';

export default function StatusView({
  loading,
  title,
  message,
  error,
  retryLabel = 'Retry',
  onRetry,
  actionLabel,
  onAction,
}) {
  return (
    <View style={styles.center}>
      {loading ? <ActivityIndicator size="large" color={C.primary} /> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {onRetry ? (
        <AppButton title={retryLabel} onPress={onRetry} style={styles.btn} />
      ) : null}
      {onAction ? (
        <AppButton title={actionLabel} onPress={onAction} style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: C.dark,
    textAlign: 'center',
    marginTop: 8,
  },
  error: {
    color: C.danger,
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.semiBold,
    marginTop: 8,
  },
  message: {
    color: C.mid,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  btn: { marginTop: 20, minWidth: 160 },
});
