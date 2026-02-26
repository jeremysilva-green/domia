import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';

export default function AuthLayout() {
  const session = useAuthStore((state) => state.session);

  if (session) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
