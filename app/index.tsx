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

  // If we have a session but owner/role never loaded, keep retrying every 2 s.
  // fetchOwnerProfile sets owner in the store; once owner is non-null the
  // interval callback becomes a no-op and the next render clears it via deps.
  useEffect(() => {
    if (!session) return;
    if (!userRole) { syncSession(session); return; }
    if (userRole !== 'owner' || owner) return;

    fetchOwnerProfile();
    const interval = setInterval(fetchOwnerProfile, 2000);
    return () => clearInterval(interval);
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

  // After registration: deep link auto-signs the user in (PKCE code in URL).
  // If the link fails or the user opens the app manually, fall back to login.
  if (pendingLoginRedirect || pendingEmailConfirmation) {
    if (pendingLoginRedirect) setPendingLoginRedirect(false);
    return <Redirect href="/(auth)/login" />;
  }

  // No session — show intro slides
  return <Redirect href="/(onboarding)/intro" />;
}
