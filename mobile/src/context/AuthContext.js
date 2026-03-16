import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { API_BASE_URL } from '../config';

const TOKEN_KEY = '@leetplacards_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const setToken = useCallback(async (newToken) => {
    if (newToken) {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
      setTokenState(newToken);
      try {
        const res = await fetch(`${API_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          setUser(null);
        }
      } catch (_) {
        setUser(null);
      }
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      setUser(null);
    }
  }, []);

  const loadStoredToken = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(TOKEN_KEY);
      if (stored) {
        setTokenState(stored);
        const res = await fetch(`${API_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          await AsyncStorage.removeItem(TOKEN_KEY);
          setTokenState(null);
          setUser(null);
        }
      } else {
        setTokenState(null);
        setUser(null);
      }
    } catch (_) {
      setTokenState(null);
      setUser(null);
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    loadStoredToken();
  }, [loadStoredToken]);

  useEffect(() => {
    const handleUrl = ({ url }) => {
      const parsed = Linking.parse(url);
      const tokenFromUrl = parsed.queryParams?.token;
      const errorFromUrl = parsed.queryParams?.error;
      if (tokenFromUrl) {
        setToken(tokenFromUrl);
      }
      if (errorFromUrl) {
        console.warn('Auth error:', errorFromUrl);
      }
    };
    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    return () => sub.remove();
  }, [setToken]);

  const login = useCallback(async () => {
    const redirectUrl = Linking.createURL('auth/callback');
    const authUrl = `${API_BASE_URL}/auth/github?app_redirect=${encodeURIComponent(redirectUrl)}`;
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === 'success' && result.url) {
      const parsed = Linking.parse(result.url);
      const t = parsed.queryParams?.token;
      if (t) {
        await setToken(t);
      }
    }
  }, [setToken]);

  const logout = useCallback(async () => {
    await setToken(null);
  }, [setToken]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUser(await res.json());
    } catch (_) {}
  }, [token]);

  const value = {
    token,
    user,
    loading,
    authChecked,
    setToken,
    login,
    logout,
    refreshUser,
    isLoggedIn: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
