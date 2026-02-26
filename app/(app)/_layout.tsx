import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

export default function AppLayout() {
  const { session, userRole } = useAuthStore();

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (userRole === 'tenant') {
    return <Redirect href="/(tenant)/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="property"
        options={{
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="tenant"
        options={{
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="maintenance"
        options={{
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
