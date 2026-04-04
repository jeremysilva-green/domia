import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { colors } from '../src/constants/theme';

export default function Index() {
  const session = useAuthStore((state) => state.session);
  const userRole = useAuthStore((state) => state.userRole);
  const owner = useAuthStore((state) => state.owner);
  const fetchOwnerProfile = useAuthStore((state) => state.fetchOwnerProfile);
  const syncSession = useAuthStore((state) => state.syncSession);
  const pendingLoginRedirect = useAuthStore((state) => state.pendingLoginRedirect);
  const setPendingLoginRedirect = useAuthStore((state) => state.setPendingLoginRedirect);
  const pendingEmailConfirmation = useAuthStore((state) => state.pendingEmailConfirmation);
  const router = useRouter();

  // Track where we last navigated so we never fire the same replace twice.
  // This prevents TOKEN_REFRESHED or any other state update from re-triggering
  // navigation once we're already inside the app.
  const lastRoute = useRef<string | null>(null);

  const navigate = (route: string) => {
    if (lastRoute.current === route) return;
    lastRoute.current = route;
    router.replace(route as any);
  };

  // Retry fetching owner profile every 2 s until it loads.
  useEffect(() => {
    if (!session || userRole !== 'owner' || owner) return;
    fetchOwnerProfile();
    const interval = setInterval(fetchOwnerProfile, 2000);
    return () => clearInterval(interval);
  }, [session, userRole, owner]);

  // Sync role/profile if session exists but role is missing.
  useEffect(() => {
    if (session && !userRole) syncSession(session);
  }, [session, userRole]);

  // Single navigation effect — fires when routing-relevant state changes.
  // Using router.replace in useEffect (not <Redirect> in render) ensures
  // this only fires intentionally, not on every re-render from token refresh.
  useEffect(() => {
    if (!session) {
      if (pendingLoginRedirect || pendingEmailConfirmation) {
        if (pendingLoginRedirect) setPendingLoginRedirect(false);
        navigate('/(auth)/login');
      } else {
        navigate('/(onboarding)/intro');
      }
      return;
    }

    if (userRole === 'tenant') {
      navigate('/(tenant)/(tabs)');
      return;
    }

    // Still loading role or owner profile — wait
    if (!userRole || (userRole === 'owner' && !owner)) return;

    if (userRole === 'owner' && !(owner as any).onboarding_completed) {
      navigate('/(onboarding)');
      return;
    }

    navigate('/(app)/(tabs)');
  }, [session, userRole, owner, pendingLoginRedirect, pendingEmailConfirmation]);

  // Always render a spinner — all navigation happens in useEffect above
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.yellow} />
    </View>
  );
}
