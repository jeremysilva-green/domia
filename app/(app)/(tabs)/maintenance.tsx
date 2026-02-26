// Force rebundle: 2026-02-25T09:00:00
import { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Card } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { MaintenanceRequestWithImages, MaintenanceStatus } from '../../../src/types';

type FilterStatus = 'all' | MaintenanceStatus;

function MaintenanceCard({ request }: { request: MaintenanceRequestWithImages }) {
  const router = useRouter();
  const { t } = useI18n();

  const tenantName = request.tenant?.full_name || request.submitter_name || null;
  const profileImageUrl = (request.tenant as any)?.profile_image_url || null;
  const initials = tenantName
    ? tenantName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const statusLabel: Record<string, string> = {
    submitted: t.maintenance.submitted,
    in_progress: t.maintenance.inProgress,
    completed: t.maintenance.completed,
    cancelled: t.maintenance.cancelled,
  };

  const statusColor: Record<string, string> = {
    submitted: colors.warning.main,
    in_progress: '#3b82f6',
    completed: colors.success.main,
    cancelled: colors.text.secondary,
  };

  const urgencyLabel: Record<string, string> = {
    high: t.maintenance.high,
    emergency: t.maintenance.emergency,
  };

  const urgencyColor: Record<string, string> = {
    high: colors.warning.main,
    emergency: colors.error.main,
  };

  const color = statusColor[request.status] ?? colors.text.secondary;
  const urgency = request.urgency ?? '';
  const showUrgency = urgency === 'high' || urgency === 'emergency';

  return (
    <Card
      style={styles.requestCard}
      onPress={() => router.push(`/(app)/maintenance/${request.id}`)}
    >
      <View style={styles.cardRow}>
        {tenantName && (
          profileImageUrl ? (
            <Image source={{ uri: profileImageUrl }} style={styles.tenantAvatar} />
          ) : (
            <View style={styles.tenantAvatarFallback}>
              <Text style={styles.tenantAvatarInitials}>{initials}</Text>
            </View>
          )
        )}
        <View style={styles.cardContent}>
          {tenantName && (
            <Text style={styles.tenantName}>{tenantName}</Text>
          )}
          <Text style={styles.requestTitle} numberOfLines={1}>
            {request.title}
          </Text>
          {showUrgency && (
            <View style={[styles.urgencyBadge, { backgroundColor: urgencyColor[urgency] + '22' }]}>
              <Text style={[styles.urgencyBadgeText, { color: urgencyColor[urgency] }]}>
                {urgencyLabel[urgency]}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
          <Text style={[styles.statusBadgeText, { color }]}>
            {statusLabel[request.status] ?? request.status}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export default function MaintenanceScreen() {
  const { owner } = useAuthStore();
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  const filters: { label: string; value: FilterStatus }[] = [
    { label: language === 'es' ? 'Todas' : 'All', value: 'all' },
    { label: language === 'es' ? 'Nuevas' : 'New', value: 'submitted' },
    { label: t.maintenance.inProgress, value: 'in_progress' },
    { label: language === 'es' ? 'Completadas' : 'Completed', value: 'completed' },
  ];

  const {
    data: requests,
    isLoading,
    refetch,
  } = useQuery<MaintenanceRequestWithImages[]>({
    queryKey: ['maintenance-requests', owner?.id, activeFilter],
    queryFn: async () => {
      if (!owner?.id) return [];

      // Get tenant IDs for this owner
      const tenantIds = (
        await supabase.from('tenants').select('id').eq('owner_id', owner.id)
      ).data?.map((t) => t.id) || [];

      // Build query to fetch both:
      // 1. Requests from owner's tenants (tenant_id in tenantIds)
      // 2. Public submissions directly to owner (owner_id = owner.id)
      let query = supabase
        .from('maintenance_requests')
        .select(
          `
          *,
          tenant:tenants(full_name, profile_image_url),
          unit:units(
            unit_number,
            property:properties(name)
          ),
          images:maintenance_images(*)
        `
        )
        .or(
          `owner_id.eq.${owner.id}${tenantIds.length > 0 ? `,tenant_id.in.(${tenantIds.join(',')})` : ''}`
        )
        .order('created_at', { ascending: false });

      if (activeFilter !== 'all') {
        query = query.eq('status', activeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // For app-authenticated tenants, tenant_id is their auth UUID which
      // doesn't exist in the tenants table, so the join returns null.
      // Look up names from connection_requests instead.
      const missingNameIds = data
        .filter((r: any) => r.tenant_id && !r.submitter_name && !r.tenant?.full_name)
        .map((r: any) => r.tenant_id);

      if (missingNameIds.length > 0) {
        const { data: connections } = await supabase
          .from('connection_requests')
          .select('tenant_id, tenant_name')
          .in('tenant_id', missingNameIds);

        if (connections) {
          const nameMap = new Map(connections.map((c: any) => [c.tenant_id, c.tenant_name]));
          data.forEach((r: any) => {
            if (r.tenant_id && !r.submitter_name && !r.tenant?.full_name) {
              r.submitter_name = nameMap.get(r.tenant_id) || null;
            }
          });
        }
      }

      return data;
    },
    enabled: !!owner?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t.maintenance.noRequests}</Text>
      <Text style={styles.emptySubtitle}>
        {activeFilter === 'all'
          ? t.maintenance.noRequestsSubtitle
          : `${language === 'es' ? 'Sin solicitudes' : 'No'} ${activeFilter.replace('_', ' ')} ${language === 'es' ? '' : 'requests'}`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.maintenance.title}</Text>
      </View>

      <View style={styles.filtersContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[
              styles.filterButton,
              activeFilter === filter.value && styles.filterButtonActive,
            ]}
            onPress={() => setActiveFilter(filter.value)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === filter.value && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.cardWrapper}>
            <MaintenanceCard request={item} />
          </View>
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!isLoading ? renderEmpty : null}
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  filterButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  filterButtonActive: {
    backgroundColor: '#facc15',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  filterTextActive: {
    color: colors.background,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  cardWrapper: {
    marginBottom: spacing.md,
  },
  requestCard: {
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tenantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  tenantAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tenantAvatarInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.background,
  },
  cardContent: {
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  urgencyBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: 4,
  },
  urgencyBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  tenantName: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 2,
  },
  requestTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
