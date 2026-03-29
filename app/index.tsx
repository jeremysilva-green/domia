import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
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

  // If we have a session but owner/role never loaded (e.g. fetchOwnerProfile threw
  // on first attempt), retry. This covers cases where the initial network call
  // failed silently and released the loading screen with an incomplete store.
  useEffect(() => {
    if (!session) return;
    if (userRole === 'owner' && !owner) {
      fetchOwnerProfile();
    } else if (!userRole) {
      syncSession(session);
    }
  }, [session, userRole, owner]);

  if (session) {
    if (userRole === 'tenant') {
      return <Redirect href="/(tenant)/(tabs)" />;
    }
    // Spin while role or owner profile is still loading
    if (!userRole || (userRole === 'owner' && !owner)) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.yellow} />
        </View>
      );
    }
    // Owner: redirect to onboarding if not yet completed, otherwise go to app
    if (userRole === 'owner' && !(owner as any).onboarding_completed) {
      return <Redirect href="/(onboarding)" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  // After registration or email confirmation deep link — send to login, not intro
  if (pendingLoginRedirect || pendingEmailConfirmation) {
    if (pendingLoginRedirect) setPendingLoginRedirect(false);
    return <Redirect href="/(auth)/login" />;
  }

  // No session — show intro slides
  return <Redirect href="/(onboarding)/intro" />;
}
