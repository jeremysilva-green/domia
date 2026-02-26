import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const session = useAuthStore((state) => state.session);
  const userRole = useAuthStore((state) => state.userRole);

  if (session) {
    if (userRole === 'tenant') {
      return <Redirect href="/(tenant)/(tabs)" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
