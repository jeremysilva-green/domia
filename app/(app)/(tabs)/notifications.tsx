import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Card, Button, Badge } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { ConnectionRequest, Property, Unit } from '../../../src/types';
import { formatMonthlyRent } from '../../../src/utils/currency';

interface ConnectionRequestWithDetails extends ConnectionRequest {
  assigned_unit?: {
    unit_number: string;
    property: {
      name: string;
    };
  } | null;
}

type UnitForModal = Pick<Unit, 'id' | 'unit_number' | 'status' | 'rent_amount' | 'currency'> & {
  tenants?: { id: string; status: string }[];
};


export default function NotificationsScreen() {
  const { owner } = useAuthStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingUnits, setRefreshingUnits] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConnectionRequestWithDetails | null>(null);
  const [showUnitModal, setShowUnitModal] = useState(false);

  const {
    data: requests,
    isLoading,
    refetch,
  } = useQuery<ConnectionRequestWithDetails[]>({
    queryKey: ['connection-requests', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];

      const { data, error } = await supabase
        .from('connection_requests')
        .select(`
          *,
          assigned_unit:unit_id (
            unit_number,
            property:property_id (
              name
            )
          )
        `)
        .eq('owner_id', owner.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!owner?.id,
  });

  const [vacantUnits, setVacantUnits] = useState<(UnitForModal & { propertyName: string })[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  const fetchVacantUnits = async () => {
    if (!owner?.id) return;
    setLoadingUnits(true);
    try {
      // Step 1: get all properties for this owner
      const { data: propertiesData, error: propError } = await supabase
        .from('properties')
        .select('id, name')
        .eq('owner_id', owner.id);

      if (propError) throw propError;

      if (!propertiesData || propertiesData.length === 0) {
        setVacantUnits([]);
        return;
      }

      const propertyIds = propertiesData.map((p: any) => p.id);
      const propertyMap: Record<string, string> = Object.fromEntries(
        propertiesData.map((p: any) => [p.id, p.name])
      );

      // Step 2: get all units for those properties
      const { data: unitsData, error: unitError } = await supabase
        .from('units')
        .select('id, unit_number, status, rent_amount, currency, property_id')
        .in('property_id', propertyIds);

      if (unitError) throw unitError;

      // Step 3: get all ACTIVE tenant unit_ids for this owner
      const { data: activeTenantsData, error: tenantError } = await supabase
        .from('tenants')
        .select('unit_id')
        .eq('owner_id', owner.id)
        .eq('status', 'active');

      if (tenantError) throw tenantError;

      const occupiedUnitIds = new Set(
        (activeTenantsData || [])
          .filter((t: any) => t.unit_id != null)
          .map((t: any) => t.unit_id)
      );

      const vacant = (unitsData || [])
        .filter((u: any) => !occupiedUnitIds.has(u.id))
        .map((u: any) => ({ ...u, propertyName: propertyMap[u.property_id] || '' }));

      setVacantUnits(vacant);
    } catch (error: any) {
      console.error('fetchVacantUnits error:', error);
      Alert.alert(t.common.error, error.message || 'Failed to load units');
    } finally {
      setLoadingUnits(false);
    }
  };

  const approveRequest = useMutation({
    mutationFn: async ({ requestId, unitId }: { requestId: string; unitId: string }) => {
      // Update connection request
      const { error: requestError } = await supabase
        .from('connection_requests')
        .update({
          status: 'approved',
          unit_id: unitId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (requestError) throw requestError;

      // Get the request details
      const { data: request } = await supabase
        .from('connection_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (!request) throw new Error('Request not found');

      // Get unit details
      const { data: unit } = await supabase
        .from('units')
        .select('rent_amount')
        .eq('id', unitId)
        .single();

      // Create or update tenant record in tenants table (upsert handles reconnections)
      const { error: tenantError } = await supabase
        .from('tenants')
        .upsert({
          id: request.tenant_id,
          unit_id: unitId,
          owner_id: owner!.id,
          full_name: request.tenant_name,
          email: request.tenant_email,
          phone: request.tenant_phone,
          rent_amount: unit?.rent_amount || 0,
          status: 'active',
          onboarding_completed: true,
        }, { onConflict: 'id' });

      if (tenantError) throw tenantError;

      // Update unit status to occupied
      const { error: unitError } = await supabase
        .from('units')
        .update({ status: 'occupied' })
        .eq('id', unitId);

      if (unitError) throw unitError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      setShowUnitModal(false);
      setSelectedRequest(null);
      Alert.alert(t.common.success, t.notifications.approvalSuccess);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || 'Failed to approve request');
    },
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('connection_requests')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      Alert.alert(t.common.done, t.notifications.declineSuccess);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || 'Failed to decline request');
    },
  });

  const handleApprove = (request: ConnectionRequestWithDetails) => {
    setSelectedRequest(request);
    setShowUnitModal(true);
    fetchVacantUnits();
  };

  const handleReject = (request: ConnectionRequestWithDetails) => {
    Alert.alert(
      t.notifications.declineConfirm,
      `${t.notifications.declineConfirmMsg} ${request.tenant_name}?`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.notifications.decline,
          style: 'destructive',
          onPress: () => rejectRequest.mutate(request.id),
        },
      ]
    );
  };

  const handleSelectUnit = (unitId: string) => {
    if (selectedRequest) {
      approveRequest.mutate({ requestId: selectedRequest.id, unitId });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const onRefreshUnits = async () => {
    setRefreshingUnits(true);
    await fetchVacantUnits();
    setRefreshingUnits(false);
  };

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const processedRequests = requests?.filter((r) => r.status !== 'pending') || [];

  const renderRequest = ({ item }: { item: ConnectionRequestWithDetails }) => {
    const isPending = item.status === 'pending';

    return (
      <Card style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>{item.tenant_name}</Text>
            <Text style={styles.requestEmail}>{item.tenant_email}</Text>
            {item.tenant_phone && (
              <Text style={styles.requestPhone}>{item.tenant_phone}</Text>
            )}
          </View>
          <Badge
            label={item.status === 'approved' ? t.notifications.approved : item.status === 'rejected' ? t.notifications.declined : t.owners.pending}
            variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
            size="sm"
          />
        </View>

        {item.status === 'approved' && item.assigned_unit && (
          <View style={styles.assignedInfo}>
            <Feather name="home" size={14} color={colors.text.secondary} />
            <Text style={styles.assignedText}>
              {item.assigned_unit.property.name} - {item.assigned_unit.unit_number}
            </Text>
          </View>
        )}

        <Text style={styles.requestDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>

        {isPending && (
          <View style={styles.actions}>
            <Button
              title={t.notifications.decline}
              variant="outline"
              size="sm"
              onPress={() => handleReject(item)}
              style={styles.actionButton}
              loading={rejectRequest.isPending}
            />
            <Button
              title={t.notifications.approve}
              size="sm"
              onPress={() => handleApprove(item)}
              style={styles.actionButton}
            />
          </View>
        )}
      </Card>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Feather name="bell-off" size={48} color={colors.gray[600]} />
      <Text style={styles.emptyTitle}>{t.notifications.noNotifications}</Text>
      <Text style={styles.emptySubtitle}>
        {t.notifications.noNotificationsSubtitle}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.notifications.title}</Text>
        {pendingRequests.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{pendingRequests.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={[...pendingRequests, ...processedRequests]}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListHeaderComponent={
          pendingRequests.length > 0 ? (
            <Text style={styles.sectionTitle}>{t.notifications.pendingRequests}</Text>
          ) : null
        }
      />

      <Modal
        visible={showUnitModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowUnitModal(false);
          setSelectedRequest(null);
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t.notifications.selectUnit}</Text>
            <TouchableOpacity
              onPress={() => {
                setShowUnitModal(false);
                setSelectedRequest(null);
              }}
            >
              <Feather name="x" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {selectedRequest && (
            <View style={styles.selectedTenant}>
              <Text style={styles.selectedTenantLabel}>{t.notifications.assigningTenant}</Text>
              <Text style={styles.selectedTenantName}>{selectedRequest.tenant_name}</Text>
            </View>
          )}

          {loadingUnits ? (
            <View style={styles.noUnitsContainer}>
              <ActivityIndicator size="large" color={colors.yellow} />
            </View>
          ) : vacantUnits.length > 0 ? (
            <FlatList
              data={vacantUnits}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.unitOption}
                  onPress={() => handleSelectUnit(item.id)}
                  disabled={approveRequest.isPending}
                >
                  <View>
                    <Text style={styles.unitPropertyName}>{item.propertyName}</Text>
                    <Text style={styles.unitNumber}>{item.unit_number}</Text>
                  </View>
                  <Text style={styles.unitRent}>
                    {formatMonthlyRent(item.rent_amount, item.currency)}
                  </Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.unitsList}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingUnits}
                  onRefresh={onRefreshUnits}
                  tintColor={colors.yellow}
                />
              }
            />
          ) : (
            <FlatList
              data={[]}
              renderItem={null}
              contentContainerStyle={styles.noUnitsContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshingUnits}
                  onRefresh={onRefreshUnits}
                  tintColor={colors.yellow}
                />
              }
              ListEmptyComponent={
                <>
                  <Feather name="home" size={48} color={colors.gray[600]} />
                  <Text style={styles.noUnitsTitle}>{t.notifications.noVacantUnits}</Text>
                  <Text style={styles.noUnitsSubtitle}>
                    {t.notifications.noVacantUnitsSubtitle}
                  </Text>
                </>
              }
            />
          )}
        </SafeAreaView>
      </Modal>
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  countBadge: {
    backgroundColor: colors.error.main,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  countText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.white,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  requestCard: {
    marginBottom: spacing.md,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    ...typography.h3,
    color: colors.text.primary,
  },
  requestEmail: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  requestPhone: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  assignedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  assignedText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  requestDate: {
    ...typography.caption,
    color: colors.gray[500],
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
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
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.text.primary,
  },
  selectedTenant: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  selectedTenantLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  selectedTenantName: {
    ...typography.h3,
    color: colors.text.primary,
  },
  unitsList: {
    padding: spacing.lg,
  },
  unitOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitPropertyName: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  unitNumber: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: 2,
  },
  unitRent: {
    ...typography.body,
    fontWeight: '600',
    color: '#facc15',
  },
  noUnitsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  noUnitsTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  noUnitsSubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
