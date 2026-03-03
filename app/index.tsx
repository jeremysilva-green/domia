import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const session = useAuthStore((state) => state.session);
  const userRole = useAuthStore((state) => state.userRole);
  const owner = useAuthStore((state) => state.owner);
  const user = useAuthStore((state) => state.user);

  if (session) {
    if (userRole === 'tenant') {
      const profileDone = user?.user_metadata?.profile_setup_completed;
      if (!profileDone) {
        return <Redirect href="/(tenant)/profile-setup" />;
      }
      return <Redirect href="/(tenant)/(tabs)" />;
    }
    // Owner: redirect to onboarding if not yet completed
    if (owner && !(owner as any).onboarding_completed) {
      return <Redirect href="/(onboarding)" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
