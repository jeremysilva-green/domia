// Force rebundle: 2026-02-04T21:30:00
import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../src/stores/authStore';
import { colors } from '../src/constants/theme';
import { View, ActivityIndicator, StyleSheet, AppState, AppStateStatus } from 'react-native';
import * as Linking from 'expo-linking';
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
  const refreshSession = useAuthStore((state) => state.refreshSession);
  const syncSession = useAuthStore((state) => state.syncSession);
  const setPendingLoginRedirect = useAuthStore((state) => state.setPendingLoginRedirect);
  const router = useRouter();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlingUrl = useRef(false);
  // Keep loading until any auth deep link is fully processed
  const [processingLink, setProcessingLink] = useState(true);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Handle deep links for email confirmation / password reset
  useEffect(() => {
    const releaseLink = () => setProcessingLink(false);

    const handleAuthUrl = async (url: string) => {
      // Signal that we're actively handling a URL so the fallback timer won't fire
      handlingUrl.current = true;
      // Cancel the fallback timer — we have a real URL to process
      if (fallbackTimer.current) {
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = null;
      }
      let sessionObtained = false;
      try {
        let session = null;
        // Implicit flow: #access_token=... — check this FIRST.
        if (url.includes('access_token=')) {
          const fragment = url.split('#')[1] ?? '';
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            // setSession updates Supabase's in-memory state, AsyncStorage, and fires
            // onAuthStateChange — the only correct way to hand a session to the client.
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (!error && data.session) session = data.session;
          }
        }
        // PKCE flow: ?code=... or #code=... (check full URL, Android may put it in hash)
        else if (url.includes('code=')) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (!error) session = data.session;
        }
        if (session) {
          await syncSession(session);
          sessionObtained = true;
        } else {
          await refreshSession();
        }
      } catch (_) {
        // ignore — no session, index.tsx will redirect to login/intro
      } finally {
        // Release the loading lock. If a session was obtained, reset to root so
        // index.tsx re-evaluates with fresh state and routes to onboarding/tabs —
        // even if the 600 ms fallback already pushed navigation to login.
        releaseLink();
        if (sessionObtained) {
          router.replace('/');
        }
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url && url.startsWith('domus://')) {
        // Cold start: app was opened by tapping the link
        handleAuthUrl(url);
      } else {
        // No launch URL. Start a fallback timer so the app doesn't hang forever.
        // Guard: if the url event already fired and handleAuthUrl is running,
        // don't set the timer — it would release the lock prematurely.
        if (!handlingUrl.current) {
          fallbackTimer.current = setTimeout(releaseLink, 1500);
        }
      }
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('domus://')) {
        // Re-lock while we process the deep link. This unmounts the current
        // Stack/screens and shows LoadingScreen. When handleAuthUrl finishes
        // (session + profile fully loaded), releaseLink() remounts the Stack
        // and index.tsx renders fresh with the correct session → correct route.
        setProcessingLink(true);
        handleAuthUrl(url);
      }
    });

    return () => {
      sub.remove();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [refreshSession, syncSession]);

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

  if (!isInitialized || processingLink) {
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
        <Stack.Screen name="(demo)" />
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
