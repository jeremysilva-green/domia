import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Card, Button } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

export default function TenantRequestsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

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
  const { data: requests = [], refetch } = useQuery({
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

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

  const renderRequestItem = ({ item }: { item: any }) => {
    const isCompleted = item.status === 'completed';
    return (
      <Card style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <Text style={styles.requestTitle} numberOfLines={1}>{item.title}</Text>
          <View style={isCompleted ? styles.completedBadge : styles.pendingBadge}>
            <Text style={isCompleted ? styles.completedText : styles.pendingText}>
              {isCompleted ? t.maintenance.completed : t.maintenance.pending}
            </Text>
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
        <Button
          title={t.maintenance.newRequest}
          size="sm"
          onPress={() => router.push('/(tenant)/maintenance/new')}
          style={styles.newRequestButton}
        />
      </View>

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
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  newRequestButton: {
    alignSelf: 'center',
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
  pendingBadge: {
    backgroundColor: colors.warning.light,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  pendingText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.warning.main,
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
