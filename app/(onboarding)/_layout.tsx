import { Stack } from 'expo-router';
import { colors } from '../../src/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'fade',
      }}
    />
  );
}
