import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth, userHasRepo } from './src/context/AuthContext';
import { setAuthToken } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import ConnectRepoScreen from './src/screens/ConnectRepoScreen';
import FlashcardDeckScreen from './src/screens/FlashcardDeckScreen';
import { C, fonts } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.text,
  headerTitleStyle: { fontFamily: fonts.semiBold, fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: C.bg },
};

function MainStack() {
  const { user } = useAuth();
  const hasRepo = userHasRepo(user);

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
      initialRouteName={hasRepo ? 'Study' : 'ConnectRepo'}
    >
      <Stack.Screen
        name="ConnectRepo"
        component={ConnectRepoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Study"
        component={FlashcardDeckScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function AppContent() {
  const { token, authChecked, isLoggedIn } = useAuth();

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  if (!authChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

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
  const [loaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
