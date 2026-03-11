import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Card, Button, ConfirmDialog } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

export default function TenantRequestsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const storageKey = user?.id ? `tenant-requests-dismissed-${user.id}` : null;

  // Load dismissed IDs from storage on mount
  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (raw) setDismissedIds(new Set(JSON.parse(raw)));
    });
  }, [storageKey]);

  // Check if tenant is connected
  const { data: connection } = useQuery({
    queryKey: ['tenant-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('connection_requests')
        .select('*, unit:units(id)')
        .eq('tenant_id', user.id)
        .eq('status', 'approved')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch maintenance requests submitted by this tenant
  const { data: allRequests = [], refetch } = useQuery({
    queryKey: ['tenant-maintenance-requests', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Filter out dismissed requests
  const requests = allRequests.filter((r: any) => !dismissedIds.has(r.id));

  // Real-time: refresh list when owner updates a request's status
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`tenant-maintenance-rt-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'maintenance_requests',
          filter: `tenant_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-maintenance-requests', user.id] });
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
    if (!storageKey) return;
    const allIds = allRequests.map((r: any) => r.id);
    const merged = Array.from(new Set([...Array.from(dismissedIds), ...allIds]));
    await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
    setDismissedIds(new Set(merged));
    setShowClearConfirm(false);
  }, [storageKey, allRequests, dismissedIds]);

  const isConnected = !!connection;

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.maintenance.title}</Text>
        </View>
        <View style={styles.notConnected}>
          <Feather name="link-2" size={48} color={colors.text.secondary} />
          <Text style={styles.notConnectedTitle}>{t.tenantHome.notConnected}</Text>
          <Text style={styles.notConnectedText}>
            {t.tenantRequests.notConnectedText}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusStyle: Record<string, { badge: object; text: object; label: string }> = {
    submitted:  { badge: styles.submittedBadge,  text: styles.submittedText,  label: t.maintenance.submitted },
    in_progress:{ badge: styles.inProgressBadge, text: styles.inProgressText, label: t.maintenance.inProgress },
    completed:  { badge: styles.completedBadge,  text: styles.completedText,  label: t.maintenance.completed },
    cancelled:  { badge: styles.cancelledBadge,  text: styles.cancelledText,  label: t.maintenance.cancelled },
  };

  const renderRequestItem = ({ item }: { item: any }) => {
    const s = statusStyle[item.status] ?? statusStyle.submitted;
    return (
      <Card style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
          <View style={s.badge}>
            <Text style={s.text}>{s.label}</Text>
          </View>
        </View>
        <Text style={styles.requestDescription} numberOfLines={2}>
          {item.description}
        </Text>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.maintenance.title}</Text>
      </View>

      <View style={styles.newRequestRow}>
        <Button
          title={t.maintenance.newRequest}
          size="sm"
          onPress={() => router.push('/(tenant)/maintenance/new')}
        />
      </View>

      {requests.length > 0 && (
        <TouchableOpacity onPress={() => setShowClearConfirm(true)} style={styles.clearAllRow}>
          <Text style={styles.clearAll}>{t.tenantRequests.clearAll}</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={requests}
        renderItem={renderRequestItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={48} color={colors.success.main} />
            <Text style={styles.emptyTitle}>{t.tenantRequests.allGood}</Text>
            <Text style={styles.emptyText}>
              {t.tenantRequests.noRequestsNow}
            </Text>
          </View>
        }
      />

      <ConfirmDialog
        visible={showClearConfirm}
        title={t.tenantRequests.clearAllConfirm}
        message={t.tenantRequests.clearAllConfirmMsg}
        confirmText={t.tenantRequests.clearAll}
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  newRequestRow: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  clearAllRow: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  clearAll: {
    ...typography.bodySmall,
    color: colors.yellow,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  requestCard: {
    marginBottom: spacing.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  requestTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  requestDescription: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  submittedBadge: {
    backgroundColor: colors.warning.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  submittedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.warning.main,
  },
  inProgressBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  inProgressText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#3b82f6',
  },
  completedBadge: {
    backgroundColor: colors.success.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  completedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success.main,
  },
  cancelledBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  cancelledText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  notConnected: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  notConnectedTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  notConnectedText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
