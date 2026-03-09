import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../src/stores/authStore';
import { colors } from '../src/constants/theme';

export default function Index() {
  const session = useAuthStore((state) => state.session);
  const userRole = useAuthStore((state) => state.userRole);
  const owner = useAuthStore((state) => state.owner);

  if (session) {
    if (userRole === 'tenant') {
      return <Redirect href="/(tenant)/(tabs)" />;
    }
    // Spin only while userRole hasn't been determined yet (brief window)
    if (!userRole) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.yellow} />
        </View>
      );
    }
    // Owner: redirect to onboarding if not yet completed, otherwise go to app
    if (owner && !(owner as any).onboarding_completed) {
      return <Redirect href="/(onboarding)" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  // No session — show intro slides
  return <Redirect href="/(onboarding)/intro" />;
}
