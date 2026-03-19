import Constants from 'expo-constants';

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
const appConfigApiUrl = Constants.expoConfig?.extra?.apiUrl;

// Priority:
// 1) EXPO_PUBLIC_API_URL (recommended for preview/production builds)
// 2) app.json extra.apiUrl (useful for local development defaults)
// 3) localhost fallback
const selectedApiUrl = envApiUrl || appConfigApiUrl || 'http://localhost:8000';

export const API_BASE_URL = normalizeBaseUrl(selectedApiUrl);
