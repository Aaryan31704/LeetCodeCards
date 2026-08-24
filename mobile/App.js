import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { setAuthToken } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import ConnectRepoScreen from './src/screens/ConnectRepoScreen';
import FlashcardDeckScreen from './src/screens/FlashcardDeckScreen';
import PlacardListScreen from './src/screens/PlacardListScreen';
import PlacardViewScreen from './src/screens/PlacardViewScreen';
import { C, fonts } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.dark,
  headerTitleStyle: { fontFamily: fonts.semiBold, fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: C.bg },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.light,
        tabBarLabelStyle: { fontFamily: fonts.semiBold, fontSize: 11, marginBottom: 2 },
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: C.white,
          borderTopColor: C.border,
          borderTopWidth: 1,
          paddingTop: 4,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            Study: focused ? 'albums' : 'albums-outline',
            Library: focused ? 'library' : 'library-outline',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Study" component={FlashcardDeckScreen} />
      <Tab.Screen name="Library" component={PlacardListScreen} />
    </Tab.Navigator>
  );
}

function MainStack() {
  const { user } = useAuth();
  const hasRepo = user?.repo_owner && user?.repo_name;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {!hasRepo ? (
        <Stack.Screen
          name="ConnectRepo"
          component={ConnectRepoScreen}
          options={{ headerShown: false }}
        />
      ) : null}
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PlacardView"
        component={PlacardViewScreen}
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
        <StatusBar style="dark" />
        <LoginScreen />
      </>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
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
