import { Stack } from 'expo-router';
import { colors } from '../../src/constants/theme';

export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="onboard" />
      <Stack.Screen name="portal" />
      <Stack.Screen name="maintenance" />
    </Stack>
  );
}
