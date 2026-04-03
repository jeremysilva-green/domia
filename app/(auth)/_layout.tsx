import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../../src/stores/authStore';

export default function AuthLayout() {
  const session = useAuthStore((state) => state.session);
  const router = useRouter();

  // Redirect after mount — never during render, to avoid StackRouter crash
  // when this layout is briefly mounted during a navigation transition.
  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [session]);

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
