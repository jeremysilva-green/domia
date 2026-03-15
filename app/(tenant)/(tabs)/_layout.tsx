import { useState, useEffect, useRef } from 'react';
import { Tabs, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../../../src/i18n';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { colors } from '../../../src/constants/theme';

export default function TenantTabsLayout() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const { data: inboxCount } = useQuery({
    queryKey: ['tenant-inbox-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;

      const [{ count: maintenanceCount }, { count: connectionCount }, { data: tenantRecord }] = await Promise.all([
        supabase
          .from('maintenance_requests')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', user.id)
          .eq('seen_by_tenant', false),
        supabase
          .from('connection_requests')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', user.id)
          .eq('seen_by_tenant', false),
        supabase
          .from('tenants')
          .select('lease_seen_by_tenant')
          .eq('id', user.id)
          .single(),
      ]);

      const leaseUnseen = (tenantRecord as any)?.lease_seen_by_tenant === false ? 1 : 0;
      return (maintenanceCount || 0) + (connectionCount || 0) + leaseUnseen;
    },
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  // Badge is only active when count genuinely increases (new notification),
  // and is deactivated when the inbox is visited or count drops to 0.
  const [badgeActive, setBadgeActive] = useState(false);
  const prevCount = useRef(0);

  useEffect(() => {
    const curr = inboxCount ?? 0;
    const onInbox = pathname.endsWith('/inbox');

    if (onInbox || curr === 0) {
      setBadgeActive(false);
      prevCount.current = curr;
      return;
    }

    // Show badge only when count increases (new notification arrived)
    if (curr > prevCount.current) {
      setBadgeActive(true);
    }

    prevCount.current = curr;
  }, [inboxCount, pathname]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
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
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="owners"
        options={{
          title: t.nav.owners,
          tabBarIcon: ({ color }) => (
            <Feather name="users" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: t.nav.requests,
          tabBarIcon: ({ color }) => (
            <Feather name="tool" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t.nav.inbox,
          tabBarIcon: ({ color }) => (
            <Feather name="bell" size={28} color={color} />
          ),
          tabBarBadge: (inboxCount && badgeActive) ? inboxCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.error.main, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.nav.settings,
          tabBarIcon: ({ color }) => (
            <Feather name="settings" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
