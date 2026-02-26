import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '../../../src/i18n';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { colors } from '../../../src/constants/theme';

export default function TenantTabsLayout() {
  const { t } = useI18n();
  const { user } = useAuthStore();

  const { data: openRequestsCount } = useQuery({
    queryKey: ['tenant-open-requests-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count } = await supabase
        .from('maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', user.id)
        .in('status', ['submitted', 'in_progress']);
      return count || 0;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 85,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarActiveTintColor: colors.yellow,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.nav.home,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="owners"
        options={{
          title: t.nav.owners,
          tabBarIcon: ({ color, size }) => (
            <Feather name="users" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t.nav.requests,
          tabBarIcon: ({ color, size }) => (
            <Feather name="tool" size={size} color={color} />
          ),
          tabBarBadge: openRequestsCount ? openRequestsCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error.main, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.nav.settings,
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
