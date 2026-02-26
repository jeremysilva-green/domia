import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { colors } from '../../src/constants/theme';

export default function TenantLayout() {
  const { session, isInitialized, userRole } = useAuthStore();

  if (!isInitialized) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Redirect owners to their app
  if (userRole === 'owner') {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    />
  );
}
