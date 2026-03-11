import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Card, ConfirmDialog } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

type NotificationItem = {
  id: string;
  type:
    | 'connection_approved'
    | 'connection_rejected'
    | 'lease_uploaded'
    | 'maintenance_in_progress'
    | 'maintenance_completed';
  title: string;
  message: string;
  timestamp: string | null;
  seen: boolean;
};

const ICON_CONFIG: Record<NotificationItem['type'], { icon: string; color: string }> = {
  connection_approved:    { icon: 'check-circle', color: colors.success.main },
  connection_rejected:    { icon: 'x-circle',     color: colors.error.main },
  lease_uploaded:         { icon: 'file-text',    color: colors.yellow },
  maintenance_in_progress:{ icon: 'clock',        color: '#3b82f6' },
  maintenance_completed:  { icon: 'check-circle', color: colors.success.main },
};

export default function TenantInboxScreen() {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const storageKey = user?.id ? `tenant-inbox-dismissed-${user.id}` : null;

  // Load dismissed IDs from storage on mount
  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw) setDismissedIds(new Set(JSON.parse(raw)));
    });
  }, [storageKey]);

  const { data: allNotifications = [], refetch } = useQuery<NotificationItem[]>({
    queryKey: ['tenant-inbox', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const [connResult, tenantResult, maintenanceResult] = await Promise.all([
        supabase
          .from('connection_requests')
          .select('id, status, seen_by_tenant, updated_at, property:properties(name)')
          .eq('tenant_id', user.id)
          .in('status', ['approved', 'rejected'])
          .order('updated_at', { ascending: false }),
        supabase
          .from('tenants')
          .select('lease_image_url, lease_seen_by_tenant, updated_at')
          .eq('id', user.id)
          .single(),
        supabase
          .from('maintenance_requests')
          .select('id, title, status, seen_by_tenant, updated_at')
          .eq('tenant_id', user.id)
          .in('status', ['in_progress', 'completed'])
          .order('updated_at', { ascending: false }),
      ]);

      const items: NotificationItem[] = [];

      // Connection request status notifications
      for (const req of connResult.data || []) {
        const r = req as any;
        const propertyName = r.property?.name || '';
        const approved = r.status === 'approved';
        items.push({
          id: `conn-${r.id}`,
          type: approved ? 'connection_approved' : 'connection_rejected',
          title: approved ? t.inbox.connectionApproved : t.inbox.connectionRejected,
          message: `${approved ? t.inbox.connectionApprovedMsg : t.inbox.connectionRejectedMsg}${propertyName ? ` · ${propertyName}` : ''}`,
          timestamp: r.updated_at,
          seen: (r as any).seen_by_tenant ?? true,
        });
      }

      // Lease document upload notification
      const tenant = tenantResult.data as any;
      if (tenant?.lease_image_url) {
        items.push({
          id: 'lease',
          type: 'lease_uploaded',
          title: t.inbox.leaseUploaded,
          message: t.inbox.leaseUploadedMsg,
          timestamp: tenant.updated_at,
          seen: tenant.lease_seen_by_tenant ?? true,
        });
      }

      // Maintenance request status updates
      for (const req of maintenanceResult.data || []) {
        const r = req as any;
        items.push({
          id: `maint-${r.id}`,
          type: r.status === 'in_progress' ? 'maintenance_in_progress' : 'maintenance_completed',
          title: r.status === 'in_progress' ? t.inbox.maintenanceInProgress : t.inbox.maintenanceCompleted,
          message: r.title,
          timestamp: r.updated_at,
          seen: r.seen_by_tenant ?? true,
        });
      }

      // Sort newest first
      return items.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    },
    enabled: !!user?.id,
  });

  // Filter out dismissed items
  const notifications = allNotifications.filter((n) => !dismissedIds.has(n.id));

  // Mark everything as seen when the inbox is opened
  useEffect(() => {
    if (!isFocused || !user?.id) return;

    const markAllSeen = async () => {
      await Promise.all([
        supabase
          .from('connection_requests')
          .update({ seen_by_tenant: true } as any)
          .eq('tenant_id', user.id)
          .eq('seen_by_tenant', false),
        supabase
          .from('maintenance_requests')
          .update({ seen_by_tenant: true } as any)
          .eq('tenant_id', user.id)
          .eq('seen_by_tenant', false),
        supabase
          .from('tenants')
          .update({ lease_seen_by_tenant: true } as any)
          .eq('id', user.id),
      ]);
      // Immediately zero the badge without waiting for a refetch
      queryClient.setQueryData(['tenant-inbox-count', user.id], 0);
      queryClient.invalidateQueries({ queryKey: ['tenant-inbox-count', user.id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-inbox', user.id] });
    };

    markAllSeen();
  }, [isFocused, user?.id, queryClient]);

  // Real-time: refresh inbox when connection or maintenance requests change
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`tenant-inbox-rt-${user.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `tenant_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-inbox', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-inbox-count', user.id] });
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'maintenance_requests', filter: `tenant_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-inbox', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-inbox-count', user.id] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, queryClient]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleClearAll = useCallback(async () => {
    if (!storageKey || !user?.id) return;
    // Dismiss locally
    const allIds = allNotifications.map((n) => n.id);
    const merged = Array.from(new Set([...Array.from(dismissedIds), ...allIds]));
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    setDismissedIds(new Set(merged));
    // Also mark all as seen in DB so the badge clears
    await Promise.all([
      supabase
        .from('connection_requests')
        .update({ seen_by_tenant: true } as any)
        .eq('tenant_id', user.id)
        .eq('seen_by_tenant', false),
      supabase
        .from('maintenance_requests')
        .update({ seen_by_tenant: true } as any)
        .eq('tenant_id', user.id)
        .eq('seen_by_tenant', false),
      supabase
        .from('tenants')
        .update({ lease_seen_by_tenant: true } as any)
        .eq('id', user.id),
    ]);
    queryClient.setQueryData(['tenant-inbox-count', user.id], 0);
    queryClient.invalidateQueries({ queryKey: ['tenant-inbox-count', user.id] });
    setShowClearConfirm(false);
  }, [storageKey, user?.id, allNotifications, dismissedIds, queryClient]);

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const { icon, color } = ICON_CONFIG[item.type];
    return (
      <Card style={!item.seen ? { ...styles.card, ...styles.cardUnseen } : styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconBg, { backgroundColor: color + '22' }]}>
            <Feather name={icon as any} size={20} color={color} />
          </View>
          <View style={styles.content}>
            <View style={styles.titleRow}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              {!item.seen && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
            {item.timestamp && (
              <Text style={styles.time}>
                {format(new Date(item.timestamp), 'MMM d, yyyy')}
              </Text>
            )}
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.inbox.title}</Text>
        {notifications.length > 0 && (
          <TouchableOpacity onPress={() => setShowClearConfirm(true)}>
            <Text style={styles.clearAll}>{t.inbox.clearAll}</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color={colors.text.secondary} />
            <Text style={styles.emptyTitle}>{t.inbox.empty}</Text>
            <Text style={styles.emptyText}>{t.inbox.emptySubtitle}</Text>
          </View>
        }
      />
      <ConfirmDialog
        visible={showClearConfirm}
        title={t.inbox.clearAllConfirm}
        message={t.inbox.clearAllConfirmMsg}
        confirmText={t.inbox.clearAll}
        cancelText={t.common.cancel}
        destructive
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  clearAll: {
    ...typography.bodySmall,
    color: colors.yellow,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  card: {
    marginBottom: spacing.sm,
  },
  cardUnseen: {
    borderLeftWidth: 3,
    borderLeftColor: colors.yellow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  itemTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.yellow,
    flexShrink: 0,
  },
  message: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  time: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
