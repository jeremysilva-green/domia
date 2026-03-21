// Force rebundle: 2026-02-04T21:30:00
import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/authStore';
import { colors } from '../src/constants/theme';
import { View, ActivityIndicator, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { supabase } from '../src/services/supabase';
import { AppAlertHost } from '../src/components/ui/AppAlert';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
    },
  },
});

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary[600]} />
    </View>
  );
}

function RootLayoutNav() {
  const initialize = useAuthStore((state) => state.initialize);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Refresh Supabase auth session when app comes back to the foreground.
  // Without this, the access token expires after ~1 hour in the background
  // and all API calls hang indefinitely, leaving spinners stuck.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        supabase.auth.startAutoRefresh();
        queryClient.invalidateQueries();
      } else if (nextState.match(/inactive|background/)) {
        supabase.auth.stopAutoRefresh();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  if (!isInitialized) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tenant)" />
        <Stack.Screen name="(public)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <RootLayoutNav />
        <AppAlertHost />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
