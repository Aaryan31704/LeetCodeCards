import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { setAuthToken } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import ConnectRepoScreen from './src/screens/ConnectRepoScreen';
import FlashcardDeckScreen from './src/screens/FlashcardDeckScreen';
import PlacardListScreen from './src/screens/PlacardListScreen';
import PlacardViewScreen from './src/screens/PlacardViewScreen';

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: '#0f172a' },
  headerTintColor: '#e2e8f0',
  headerTitleStyle: { fontWeight: '600', fontSize: 18 },
  contentStyle: { backgroundColor: '#0f172a' },
};

function MainStack() {
  const { user } = useAuth();
  const hasRepo = user?.repo_owner && user?.repo_name;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!hasRepo ? (
        <Stack.Screen
          name="ConnectRepo"
          component={ConnectRepoScreen}
          options={{ title: 'Connect repo' }}
        />
      ) : null}
      <Stack.Screen
        name="FlashcardDeck"
        component={FlashcardDeckScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlacardList"
        component={PlacardListScreen}
        options={{ title: 'All Placards' }}
      />
      <Stack.Screen
        name="PlacardView"
        component={PlacardViewScreen}
        options={{ title: 'Placard' }}
      />
    </Stack.Navigator>
  );
}

function AppContent() {
  const { token, authChecked, isLoggedIn } = useAuth();

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  if (!authChecked) return null;

  if (!isLoggedIn) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <MainStack />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
