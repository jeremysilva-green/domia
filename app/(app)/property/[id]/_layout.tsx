import { Stack } from 'expo-router';
import { colors } from '../../../../src/constants/theme';

export default function PropertyDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="unit" />
    </Stack>
  );
}
