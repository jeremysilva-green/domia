import { Stack } from 'expo-router';
import { colors } from '../../../../../src/constants/theme';

export default function UnitLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="new" />
      <Stack.Screen name="[unitId]" />
    </Stack>
  );
}
