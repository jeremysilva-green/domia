// Force rebundle: 2026-02-04T21:30:00 - All yellow colors are now #facc15
import { useRef, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, RefreshControl, Image, Modal, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import PagerView from 'react-native-pager-view';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useI18n, Language } from '../../../src/i18n';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { StatCard } from '../../../src/components/dashboard';
import { Card, Button, Badge } from '../../../src/components/ui';
import { StatusBadge } from '../../../src/components/shared';
import {
  DashboardStats,
  ExpiringLease,
  PropertyWithUnits,
  MaintenanceRequestWithImages,
  MaintenanceStatus,
  ConnectionRequest,
  Property,
  Unit
} from '../../../src/types';
import { formatMonthlyRent } from '../../../src/utils/currency';

// ============================================
// TAB CONFIGURATION
// ============================================

interface TabConfig {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  labelKey: 'home' | 'properties' | 'requests' | 'inbox' | 'settings';
}

const TABS: TabConfig[] = [
  { key: 'home', icon: 'home', labelKey: 'home' },
  { key: 'properties', icon: 'apartment', labelKey: 'properties' },
  { key: 'maintenance', icon: 'campaign', labelKey: 'requests' },
  { key: 'notifications', icon: 'notifications', labelKey: 'inbox' },
  { key: 'settings', icon: 'settings', labelKey: 'settings' },
];

// ============================================
// DASHBOARD CONTENT
// ============================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function DashboardContent() {
  const router = useRouter();
  const { owner } = useAuthStore();
  const { t, language } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', owner?.id],
    queryFn: async () => {
      if (!owner?.id) throw new Error('No owner');
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const [propertiesRes, unitsRes, tenantsRes, paymentsRes, maintenanceRes] =
        await Promise.all([
          supabase.from('properties').select('id').eq('owner_id', owner.id),
          supabase
            .from('units')
            .select('id, status, property_id')
            .in(
              'property_id',
              (await supabase.from('properties').select('id').eq('owner_id', owner.id)).data?.map((p) => p.id) || []
            ),
          supabase.from('tenants').select('id, rent_amount').eq('owner_id', owner.id).eq('status', 'active'),
          supabase
            .from('rent_payments')
            .select('amount_due, amount_paid, status')
            .eq('period_month', currentMonth)
            .eq('period_year', currentYear)
            .in(
              'tenant_id',
              (await supabase.from('tenants').select('id').eq('owner_id', owner.id)).data?.map((t) => t.id) || []
            ),
          supabase
            .from('maintenance_requests')
            .select('id, status')
            .in('status', ['submitted', 'in_progress'])
            .in(
              'tenant_id',
              (await supabase.from('tenants').select('id').eq('owner_id', owner.id)).data?.map((t) => t.id) || []
            ),
        ]);

      const properties = propertiesRes.data || [];
      const units = unitsRes.data || [];
      const tenants = tenantsRes.data || [];
      const payments = paymentsRes.data || [];
      const maintenance = maintenanceRes.data || [];

      return {
        totalRentExpected: tenants.reduce((sum, t) => sum + (t.rent_amount || 0), 0),
        totalRentCollected: payments.reduce((sum, p) => sum + (p.amount_paid || 0), 0),
        latePaymentsCount: payments.filter((p) => p.status === 'late').length,
        activeMaintenanceCount: maintenance.length,
        propertiesCount: properties.length,
        occupiedUnitsCount: units.filter((u) => u.status === 'occupied').length,
        totalUnitsCount: units.length,
      };
    },
    enabled: !!owner?.id,
  });

  const { data: expiringLeases, refetch: refetchLeases } = useQuery<ExpiringLease[]>({
    queryKey: ['expiring-leases', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data } = await supabase
        .from('tenants')
        .select(`id, full_name, lease_end, unit:units(unit_number, property:properties(name))`)
        .eq('owner_id', owner.id)
        .eq('status', 'active')
        .not('lease_end', 'is', null)
        .lte('lease_end', thirtyDaysFromNow.toISOString())
        .gte('lease_end', new Date().toISOString())
        .order('lease_end', { ascending: true })
        .limit(5);

      return (
        data?.map((tenant: any) => {
          const leaseEnd = new Date(tenant.lease_end);
          const today = new Date();
          const daysUntilExpiry = Math.ceil((leaseEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return {
            tenantId: tenant.id,
            tenantName: tenant.full_name || 'Unnamed Tenant',
            propertyName: tenant.unit?.property?.name || 'Unknown Property',
            unitNumber: tenant.unit?.unit_number || '',
            leaseEnd: tenant.lease_end,
            daysUntilExpiry,
          };
        }) || []
      );
    },
    enabled: !!owner?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchLeases()]);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <ScrollView
        style={contentStyles.scrollView}
        contentContainerStyle={contentStyles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={contentStyles.header}>
          <Image
            source={require('../../../assets/Domia Logo Crop.png')}
            style={contentStyles.logo}
            resizeMode="contain"
          />
          <Text style={contentStyles.ownerName}>{owner?.full_name || 'Owner'}</Text>
        </View>

        <View style={contentStyles.statsRow}>
          <StatCard
            title={language === 'es' ? 'Esperado' : 'Expected'}
            value={formatCurrency(stats?.totalRentExpected || 0)}
            subtitle={language === 'es' ? 'Este mes' : 'This month'}
            style={contentStyles.statCard}
          />
          <StatCard
            title={t.home.collected}
            value={formatCurrency(stats?.totalRentCollected || 0)}
            subtitle={language === 'es' ? 'Este mes' : 'This month'}
            variant="success"
            style={contentStyles.statCard}
          />
        </View>

        <View style={contentStyles.statsRow}>
          <StatCard
            title={language === 'es' ? 'Atrasados' : 'Late'}
            value={stats?.latePaymentsCount || 0}
            subtitle={language === 'es' ? 'Pagos' : 'Payments'}
            variant={stats?.latePaymentsCount ? 'error' : 'default'}
            style={contentStyles.statCard}
          />
          <StatCard
            title={language === 'es' ? 'Activas' : 'Active'}
            value={stats?.activeMaintenanceCount || 0}
            subtitle={language === 'es' ? 'Solicitudes' : 'Requests'}
            variant={stats?.activeMaintenanceCount ? 'warning' : 'default'}
            style={contentStyles.statCard}
          />
        </View>

        <View style={contentStyles.section}>
          <Text style={contentStyles.sectionTitle}>
            {language === 'es' ? 'Próximos a Vencer' : 'Expiring Soon'}
          </Text>
          {expiringLeases && expiringLeases.length > 0 ? (
            expiringLeases.map((lease) => (
              <Card
                key={lease.tenantId}
                style={contentStyles.leaseCard}
                onPress={() => router.push(`/(app)/tenant/${lease.tenantId}`)}
              >
                <View style={contentStyles.leaseRow}>
                  <View style={contentStyles.leaseInfo}>
                    <Text style={contentStyles.leaseTenant}>{lease.tenantName}</Text>
                    <Text style={contentStyles.leaseProperty}>
                      {lease.propertyName}
                      {lease.unitNumber && ` - ${lease.unitNumber}`}
                    </Text>
                  </View>
                  <View style={contentStyles.leaseDays}>
                    <Text style={[contentStyles.daysCount, lease.daysUntilExpiry <= 7 && contentStyles.daysUrgent]}>
                      {lease.daysUntilExpiry}
                    </Text>
                    <Text style={contentStyles.daysLabel}>{language === 'es' ? 'días' : 'days'}</Text>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card style={contentStyles.emptyCard}>
              <Text style={contentStyles.emptyText}>
                {language === 'es'
                  ? 'No hay contratos por vencer en los próximos 30 días'
                  : 'No leases expiring in the next 30 days'}
              </Text>
            </Card>
          )}
        </View>

        <View style={contentStyles.section}>
          <Text style={contentStyles.sectionTitle}>{language === 'es' ? 'Portafolio' : 'Portfolio'}</Text>
          <Card style={contentStyles.portfolioCard}>
            <View style={contentStyles.portfolioRow}>
              <Text style={contentStyles.portfolioLabel}>{t.properties.title}</Text>
              <Text style={contentStyles.portfolioValue}>{stats?.propertiesCount || 0}</Text>
            </View>
            <View style={contentStyles.portfolioRow}>
              <Text style={contentStyles.portfolioLabel}>{t.units.title}</Text>
              <Text style={contentStyles.portfolioValue}>{stats?.totalUnitsCount || 0}</Text>
            </View>
            <View style={contentStyles.portfolioRow}>
              <Text style={contentStyles.portfolioLabel}>{language === 'es' ? 'Ocupación' : 'Occupancy'}</Text>
              <Text style={contentStyles.portfolioValue}>
                {stats?.totalUnitsCount ? Math.round(((stats?.occupiedUnitsCount || 0) / stats.totalUnitsCount) * 100) : 0}%
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// PROPERTIES CONTENT
// ============================================

function PropertyCard({ property }: { property: PropertyWithUnits }) {
  const router = useRouter();
  const occupiedCount = property.units.filter((u) => u.status === 'occupied').length;
  const totalCount = property.units.length;

  return (
    <Card style={contentStyles.propertyCard} onPress={() => router.push(`/(app)/property/${property.id}`)}>
      <View style={contentStyles.propertyHeader}>
        <View style={contentStyles.propertyInfo}>
          <Text style={contentStyles.propertyName}>{property.name}</Text>
          <Text style={contentStyles.propertyAddress}>{property.address}</Text>
        </View>
        {totalCount > 0 && (
          <View style={contentStyles.occupancyBadge}>
            <Text style={contentStyles.occupancyText}>{occupiedCount}/{totalCount}</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function PropertiesContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data: properties, isLoading, refetch } = useQuery<PropertyWithUnits[]>({
    queryKey: ['properties', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('properties')
        .select(`*, units (id, status)`)
        .eq('owner_id', user.id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderEmpty = () => (
    <View style={contentStyles.emptyContainer}>
      <Text style={contentStyles.emptyTitle}>{t.properties.noProperties}</Text>
      <Text style={contentStyles.emptySubtitle}>{t.properties.noPropertiesSubtitle}</Text>
      <Button
        title={t.properties.addProperty}
        onPress={() => router.push('/(app)/property/new')}
        style={contentStyles.emptyButton}
      />
    </View>
  );

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <View style={contentStyles.screenHeader}>
        <Text style={contentStyles.screenTitle}>{t.properties.title}</Text>
        <TouchableOpacity style={contentStyles.addButton} onPress={() => router.push('/(app)/property/new')}>
          <Text style={contentStyles.addButtonText}>+ {t.common.add}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PropertyCard property={item} />}
        contentContainerStyle={contentStyles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
      />
    </SafeAreaView>
  );
}

// ============================================
// MAINTENANCE CONTENT
// ============================================

type FilterStatus = 'all' | MaintenanceStatus;

function MaintenanceCard({ request }: { request: MaintenanceRequestWithImages }) {
  const router = useRouter();

  return (
    <Card style={contentStyles.requestCard} onPress={() => router.push(`/(app)/maintenance/${request.id}`)}>
      <View style={contentStyles.cardHeader}>
        <View style={contentStyles.cardInfo}>
          <Text style={contentStyles.requestTitle} numberOfLines={1}>{request.title}</Text>
          <Text style={contentStyles.requestLocation} numberOfLines={1}>
            {request.unit?.property?.name}
            {request.unit?.unit_number && ` - ${request.unit.unit_number}`}
          </Text>
        </View>
        <StatusBadge status={request.status} type="maintenance" size="sm" />
      </View>
      <Text style={contentStyles.requestDescription} numberOfLines={2}>{request.description}</Text>
      <View style={contentStyles.cardFooter}>
        <Text style={contentStyles.requestDate}>{format(new Date(request.created_at), 'MMM d, yyyy')}</Text>
        {request.urgency === 'emergency' && (
          <View style={contentStyles.urgencyBadge}>
            <Text style={contentStyles.urgencyText}>Urgent</Text>
          </View>
        )}
        {request.urgency === 'high' && (
          <View style={[contentStyles.urgencyBadge, contentStyles.urgencyHigh]}>
            <Text style={[contentStyles.urgencyText, contentStyles.urgencyTextHigh]}>High Priority</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function MaintenanceContent() {
  const { owner } = useAuthStore();
  const { t, language } = useI18n();
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  const filters: { label: string; value: FilterStatus }[] = [
    { label: language === 'es' ? 'Todas' : 'All', value: 'all' },
    { label: language === 'es' ? 'Nuevas' : 'New', value: 'submitted' },
    { label: t.maintenance.inProgress, value: 'in_progress' },
    { label: language === 'es' ? 'Completadas' : 'Completed', value: 'completed' },
  ];

  const { data: requests, isLoading, refetch } = useQuery<MaintenanceRequestWithImages[]>({
    queryKey: ['maintenance-requests', owner?.id, activeFilter],
    queryFn: async () => {
      if (!owner?.id) return [];

      // Get tenant IDs for this owner
      const tenantIds = (await supabase.from('tenants').select('id').eq('owner_id', owner.id)).data?.map((t) => t.id) || [];

      // Build query to get requests from tenants OR direct public submissions
      let query = supabase
        .from('maintenance_requests')
        .select(`*, tenant:tenants(full_name), unit:units(unit_number, property:properties(name)), images:maintenance_images(*)`)
        .or(`owner_id.eq.${owner.id}${tenantIds.length > 0 ? `,tenant_id.in.(${tenantIds.join(',')})` : ''}`)
        .order('created_at', { ascending: false });

      if (activeFilter !== 'all') query = query.eq('status', activeFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!owner?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderEmpty = () => (
    <View style={contentStyles.emptyContainer}>
      <Text style={contentStyles.emptyTitle}>{t.maintenance.noRequests}</Text>
      <Text style={contentStyles.emptySubtitle}>
        {activeFilter === 'all' ? t.maintenance.noRequestsSubtitle : `${language === 'es' ? 'Sin solicitudes' : 'No'} ${activeFilter.replace('_', ' ')} ${language === 'es' ? '' : 'requests'}`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <View style={contentStyles.screenHeader}>
        <Text style={contentStyles.screenTitle}>{t.maintenance.title}</Text>
      </View>
      <View style={contentStyles.filtersContainer}>
        {filters.map((filter) => (
          <TouchableOpacity
            key={filter.value}
            style={[contentStyles.filterButton, activeFilter === filter.value && contentStyles.filterButtonActive]}
            onPress={() => setActiveFilter(filter.value)}
          >
            <Text style={[contentStyles.filterText, activeFilter === filter.value && contentStyles.filterTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MaintenanceCard request={item} />}
        contentContainerStyle={contentStyles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
      />
    </SafeAreaView>
  );
}

// ============================================
// NOTIFICATIONS CONTENT
// ============================================

interface ConnectionRequestWithDetails extends ConnectionRequest {
  assigned_unit?: { unit_number: string; property: { name: string } };
}

interface PropertyWithUnitsLocal extends Property {
  units: Unit[];
}

function NotificationsContent() {
  const router = useRouter();
  const { owner } = useAuthStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConnectionRequestWithDetails | null>(null);
  const [showUnitModal, setShowUnitModal] = useState(false);

  const { data: requests, isLoading, refetch } = useQuery<ConnectionRequestWithDetails[]>({
    queryKey: ['connection-requests', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];
      const { data, error } = await supabase
        .from('connection_requests')
        .select(`*, assigned_unit:unit_id (unit_number, property:property_id (name))`)
        .eq('owner_id', owner.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!owner?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: properties } = useQuery<PropertyWithUnitsLocal[]>({
    queryKey: ['properties-with-units', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];
      const { data, error } = await supabase
        .from('properties')
        .select(`*, units (id, unit_number, status, rent_amount, currency)`)
        .eq('owner_id', owner.id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!owner?.id && showUnitModal,
  });

  const approveRequest = useMutation({
    mutationFn: async ({ requestId, unitId }: { requestId: string; unitId: string }) => {
      const { error: requestError } = await supabase
        .from('connection_requests')
        .update({ status: 'approved', unit_id: unitId, updated_at: new Date().toISOString() })
        .eq('id', requestId);
      if (requestError) throw requestError;

      const { data: request } = await supabase.from('connection_requests').select('*').eq('id', requestId).single();
      if (!request) throw new Error('Request not found');

      const { data: unit } = await supabase.from('units').select('rent_amount').eq('id', unitId).single();

      const { error: tenantError } = await supabase.from('tenants').insert({
        id: request.tenant_id,
        unit_id: unitId,
        owner_id: owner!.id,
        full_name: request.tenant_name,
        email: request.tenant_email,
        phone: request.tenant_phone,
        rent_amount: unit?.rent_amount || 0,
        status: 'active',
        onboarding_completed: true,
      });
      if (tenantError && !tenantError.message.includes('duplicate')) throw tenantError;

      const { error: unitError } = await supabase.from('units').update({ status: 'occupied' }).eq('id', unitId);
      if (unitError) throw unitError;
    },
    onSuccess: () => {
      const tenantId = selectedRequest?.tenant_id;
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      setShowUnitModal(false);
      setSelectedRequest(null);

      // Navigate to tenant detail page
      if (tenantId) {
        router.push(`/(app)/tenant/${tenantId}` as any);
      } else {
        Alert.alert(t.common.success, t.notifications.approvalSuccess);
      }
    },
    onError: (error: any) => Alert.alert(t.common.error, error.message || 'Failed to approve request'),
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('connection_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      Alert.alert(t.common.done, t.notifications.declineSuccess);
    },
    onError: (error: any) => Alert.alert(t.common.error, error.message || 'Failed to decline request'),
  });

  const handleApprove = (request: ConnectionRequestWithDetails) => {
    setSelectedRequest(request);
    setShowUnitModal(true);
  };

  const handleReject = (request: ConnectionRequestWithDetails) => {
    Alert.alert(t.notifications.declineConfirm, `${t.notifications.declineConfirmMsg} ${request.tenant_name}?`, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.notifications.decline, style: 'destructive', onPress: () => rejectRequest.mutate(request.id) },
    ]);
  };

  const handleSelectUnit = (unitId: string) => {
    if (selectedRequest) approveRequest.mutate({ requestId: selectedRequest.id, unitId });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const processedRequests = requests?.filter((r) => r.status !== 'pending') || [];
  const vacantUnits = properties?.flatMap((p) => p.units.filter((u) => u.status === 'vacant').map((u) => ({ ...u, propertyName: p.name }))) || [];

  const renderRequest = ({ item }: { item: ConnectionRequestWithDetails }) => {
    const isPending = item.status === 'pending';
    return (
      <Card style={contentStyles.notifCard}>
        <View style={contentStyles.notifHeader}>
          <View style={contentStyles.notifInfo}>
            <Text style={contentStyles.notifName}>{item.tenant_name}</Text>
            <Text style={contentStyles.notifEmail}>{item.tenant_email}</Text>
            {item.tenant_phone && <Text style={contentStyles.notifPhone}>{item.tenant_phone}</Text>}
          </View>
          <Badge
            label={item.status === 'approved' ? t.notifications.approved : item.status === 'rejected' ? t.notifications.declined : t.owners.pending}
            variant={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
            size="sm"
          />
        </View>
        {item.status === 'approved' && item.assigned_unit && (
          <View style={contentStyles.assignedInfo}>
            <Feather name="home" size={14} color={colors.text.secondary} />
            <Text style={contentStyles.assignedText}>{item.assigned_unit.property.name} - {item.assigned_unit.unit_number}</Text>
          </View>
        )}
        <Text style={contentStyles.notifDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
        {isPending && (
          <View style={contentStyles.notifActions}>
            <Button title={t.notifications.decline} variant="outline" size="sm" onPress={() => handleReject(item)} style={contentStyles.actionButton} loading={rejectRequest.isPending} />
            <Button title={t.notifications.approve} size="sm" onPress={() => handleApprove(item)} style={contentStyles.actionButton} />
          </View>
        )}
      </Card>
    );
  };

  const renderEmpty = () => (
    <View style={contentStyles.emptyContainer}>
      <Feather name="bell-off" size={48} color={colors.gray[600]} />
      <Text style={contentStyles.emptyTitle}>{t.notifications.noNotifications}</Text>
      <Text style={contentStyles.emptySubtitle}>{t.notifications.noNotificationsSubtitle}</Text>
    </View>
  );

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <View style={contentStyles.screenHeader}>
        <Text style={contentStyles.screenTitle}>{t.notifications.title}</Text>
        {pendingRequests.length > 0 && (
          <View style={contentStyles.countBadge}>
            <Text style={contentStyles.countText}>{pendingRequests.length}</Text>
          </View>
        )}
      </View>
      <FlatList
        data={[...pendingRequests, ...processedRequests]}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        contentContainerStyle={contentStyles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListHeaderComponent={pendingRequests.length > 0 ? <Text style={contentStyles.listSectionTitle}>{t.notifications.pendingRequests}</Text> : null}
      />
      <Modal visible={showUnitModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowUnitModal(false); setSelectedRequest(null); }}>
        <SafeAreaView style={contentStyles.modalContainer}>
          <View style={contentStyles.modalHeader}>
            <Text style={contentStyles.modalTitle}>{t.notifications.selectUnit}</Text>
            <TouchableOpacity onPress={() => { setShowUnitModal(false); setSelectedRequest(null); }}>
              <Feather name="x" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {selectedRequest && (
            <View style={contentStyles.selectedTenant}>
              <Text style={contentStyles.selectedTenantLabel}>{t.notifications.assigningTenant}</Text>
              <Text style={contentStyles.selectedTenantName}>{selectedRequest.tenant_name}</Text>
            </View>
          )}
          {vacantUnits.length > 0 ? (
            <FlatList
              data={vacantUnits}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={contentStyles.unitOption} onPress={() => handleSelectUnit(item.id)} disabled={approveRequest.isPending}>
                  <View>
                    <Text style={contentStyles.unitPropertyName}>{item.propertyName}</Text>
                    <Text style={contentStyles.unitNumber}>{item.unit_number}</Text>
                  </View>
                  <Text style={contentStyles.unitRent}>{formatMonthlyRent(item.rent_amount, item.currency)}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={contentStyles.unitsList}
            />
          ) : (
            <View style={contentStyles.noUnitsContainer}>
              <Feather name="home" size={48} color={colors.gray[600]} />
              <Text style={contentStyles.noUnitsTitle}>{t.notifications.noVacantUnits}</Text>
              <Text style={contentStyles.noUnitsSubtitle}>{t.notifications.noVacantUnitsSubtitle}</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================
// SETTINGS CONTENT
// ============================================

function SettingsRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <View style={contentStyles.settingsRowItem}>
      <Text style={contentStyles.settingsLabel}>{label}</Text>
      <Text style={contentStyles.settingsValue}>{value || '-'}</Text>
    </View>
  );
}

function SettingsContent() {
  const { owner, signOut, isLoading } = useAuthStore();
  const { t, language, setLanguage } = useI18n();
  const [copied, setCopied] = useState(false);

  const maintenanceLink = owner?.id ? `https://domus.app/maintenance/${owner.id}` : '';

  const handleCopyMaintenanceLink = async () => {
    if (!maintenanceLink) return;
    await Clipboard.setStringAsync(maintenanceLink);
    setCopied(true);
    Alert.alert(t.settings.linkCopied, t.settings.linkCopiedDesc);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSignOut = () => {
    Alert.alert(t.auth.logout, t.auth.logoutConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.auth.logout, style: 'destructive', onPress: signOut },
    ]);
  };

  const toggleLanguage = (lang: Language) => setLanguage(lang);

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <ScrollView style={contentStyles.scrollView} contentContainerStyle={contentStyles.content} showsVerticalScrollIndicator={false}>
        <Text style={contentStyles.screenTitle}>{t.settings.title}</Text>

        <View style={contentStyles.settingsSection}>
          <Text style={contentStyles.settingsSectionTitle}>{t.settings.account}</Text>
          <Card>
            <SettingsRow label={t.settings.name} value={owner?.full_name} />
            <View style={contentStyles.divider} />
            <SettingsRow label={t.settings.email} value={owner?.email} />
            <View style={contentStyles.divider} />
            <SettingsRow label={t.settings.phone} value={owner?.phone || t.common.notSet} />
          </Card>
        </View>

        <View style={contentStyles.settingsSection}>
          <Text style={contentStyles.settingsSectionTitle}>{t.settings.language}</Text>
          <Card>
            <View style={contentStyles.languageSelector}>
              <TouchableOpacity style={[contentStyles.languageOption, language === 'en' && contentStyles.languageOptionActive]} onPress={() => toggleLanguage('en')}>
                <Text style={[contentStyles.languageText, language === 'en' && contentStyles.languageTextActive]}>{t.settings.english}</Text>
                {language === 'en' && <Feather name="check" size={18} color={colors.background} />}
              </TouchableOpacity>
              <TouchableOpacity style={[contentStyles.languageOption, language === 'es' && contentStyles.languageOptionActive]} onPress={() => toggleLanguage('es')}>
                <Text style={[contentStyles.languageText, language === 'es' && contentStyles.languageTextActive]}>{t.settings.spanish}</Text>
                {language === 'es' && <Feather name="check" size={18} color={colors.background} />}
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View style={contentStyles.settingsSection}>
          <Text style={contentStyles.settingsSectionTitle}>{t.settings.tenantTools}</Text>
          <Card>
            <View style={contentStyles.linkSection}>
              <View style={contentStyles.linkInfo}>
                <Feather name="link" size={20} color={colors.yellow} />
                <View style={contentStyles.linkTextContainer}>
                  <Text style={contentStyles.linkTitle}>{t.settings.maintenanceLink}</Text>
                  <Text style={contentStyles.linkDescription}>{t.settings.maintenanceLinkDesc}</Text>
                </View>
              </View>
              <TouchableOpacity style={contentStyles.copyButton} onPress={handleCopyMaintenanceLink}>
                <Feather name={copied ? 'check' : 'copy'} size={18} color={copied ? colors.success.main : colors.yellow} />
                <Text style={[contentStyles.copyText, copied && contentStyles.copyTextSuccess]}>{copied ? t.settings.copied : t.settings.copyLink}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>

        <View style={contentStyles.settingsSection}>
          <Text style={contentStyles.settingsSectionTitle}>{t.settings.app}</Text>
          <Card>
            <SettingsRow label={t.settings.version} value="1.0.0" />
          </Card>
        </View>

        <View style={contentStyles.signOutSection}>
          <Button title={t.auth.logout} onPress={handleSignOut} variant="outline" loading={isLoading} fullWidth />
        </View>

        <Text style={contentStyles.footer}>{t.settings.footer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// MAIN LAYOUT
// ============================================

export default function TabsLayout() {
  const { t } = useI18n();
  const { owner } = useAuthStore();
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<PagerView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: pendingInboxCount } = useQuery({
    queryKey: ['pending-connections-count', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return 0;
      const { count } = await supabase
        .from('connection_requests')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', owner.id)
        .eq('status', 'pending');
      return count || 0;
    },
    enabled: !!owner?.id,
    refetchInterval: 30000,
  });

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentIndex(e.nativeEvent.position);
  }, []);

  const handleTabPress = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
  }, []);

  const badgeCounts: Record<string, number> = {
    notifications: pendingInboxCount || 0,
  };

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={handlePageSelected}
        overdrag={true}
      >
        <View key="home" style={styles.page}>
          <DashboardContent />
        </View>
        <View key="properties" style={styles.page}>
          <PropertiesContent />
        </View>
        <View key="maintenance" style={styles.page}>
          <MaintenanceContent />
        </View>
        <View key="notifications" style={styles.page}>
          <NotificationsContent />
        </View>
        <View key="settings" style={styles.page}>
          <SettingsContent />
        </View>
      </PagerView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.md }]}>
        {TABS.map((tab, index) => {
          const focused = index === currentIndex;
          const label = t.nav[tab.labelKey];
          const badge = badgeCounts[tab.key] || 0;

          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabButton}
              onPress={() => handleTabPress(index)}
              activeOpacity={0.7}
            >
              <View style={styles.tabIcon}>
                <View style={styles.iconWrapper}>
                  <MaterialIcons
                    name={tab.icon}
                    size={24}
                    color={focused ? colors.yellow : colors.gray[500]}
                  />
                  {badge > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.label, focused && styles.labelFocused]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pager: { flex: 1 },
  page: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { alignItems: 'center', justifyContent: 'center', width: 70 },
  iconWrapper: { position: 'relative' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.error.main,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
  label: { marginTop: 4, fontSize: 10, color: colors.gray[500], textAlign: 'center' },
  labelFocused: { color: '#facc15', fontWeight: '600' },
});

const contentStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  logo: { height: 50, width: 150, marginLeft: -8 },
  ownerName: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: { flex: 1 },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text.primary, marginBottom: spacing.md },
  leaseCard: { marginBottom: spacing.sm },
  leaseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaseInfo: { flex: 1 },
  leaseTenant: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  leaseProperty: { ...typography.bodySmall, color: colors.text.secondary, marginTop: 2 },
  leaseDays: { alignItems: 'center', backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8, minWidth: 60 },
  daysCount: { fontSize: 20, fontWeight: '700', color: '#facc15' },
  daysUrgent: { color: colors.error.main },
  daysLabel: { ...typography.caption, color: colors.text.secondary },
  emptyCard: { alignItems: 'center', paddingVertical: spacing.lg },
  emptyText: { ...typography.body, color: colors.text.secondary },
  portfolioCard: { gap: spacing.sm },
  portfolioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  portfolioLabel: { ...typography.body, color: colors.text.secondary },
  portfolioValue: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  screenHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  screenTitle: { ...typography.h2, color: colors.text.primary },
  addButton: { backgroundColor: '#facc15', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 8 },
  addButtonText: { ...typography.bodySmall, fontWeight: '600', color: colors.background },
  list: { padding: spacing.lg, paddingTop: 0 },
  propertyCard: { marginBottom: spacing.md, backgroundColor: '#facc15' },
  propertyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  propertyInfo: { flex: 1 },
  propertyName: { ...typography.h3, color: colors.background },
  propertyAddress: { ...typography.bodySmall, color: 'rgba(0,0,0,0.55)', marginTop: 2 },
  occupancyBadge: { backgroundColor: 'rgba(0,0,0,0.12)', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6 },
  occupancyText: { ...typography.bodySmall, fontWeight: '600', color: colors.background },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyTitle: { ...typography.h3, color: colors.text.primary, marginBottom: spacing.xs, marginTop: spacing.md },
  emptySubtitle: { ...typography.body, color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.lg },
  emptyButton: { marginTop: spacing.md },
  filtersContainer: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.xs },
  filterButton: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: borderRadius.full, backgroundColor: colors.surfaceLight },
  filterButtonActive: { backgroundColor: '#facc15' },
  filterText: { fontSize: 12, fontWeight: '500', color: colors.text.secondary },
  filterTextActive: { color: colors.background },
  requestCard: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardInfo: { flex: 1, marginRight: spacing.sm },
  requestTitle: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  requestLocation: { ...typography.caption, color: colors.text.secondary, marginTop: 2 },
  requestDescription: { ...typography.bodySmall, color: colors.text.secondary, marginBottom: spacing.sm },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  requestDate: { ...typography.caption, color: colors.text.secondary },
  urgencyBadge: { backgroundColor: colors.error.light, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  urgencyHigh: { backgroundColor: colors.warning.light },
  urgencyText: { ...typography.caption, fontWeight: '600', color: colors.error.dark },
  urgencyTextHigh: { color: colors.warning.dark },
  notifCard: { marginBottom: spacing.md },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifInfo: { flex: 1 },
  notifName: { ...typography.h3, color: colors.text.primary },
  notifEmail: { ...typography.bodySmall, color: colors.text.secondary, marginTop: 2 },
  notifPhone: { ...typography.bodySmall, color: colors.text.secondary },
  assignedInfo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  assignedText: { ...typography.bodySmall, color: colors.text.secondary },
  notifDate: { ...typography.caption, color: colors.gray[500], marginTop: spacing.sm },
  notifActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  actionButton: { flex: 1 },
  countBadge: { backgroundColor: colors.error.main, borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  countText: { ...typography.caption, fontWeight: '600', color: colors.white },
  listSectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.md },
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { ...typography.h2, color: colors.text.primary },
  selectedTenant: { padding: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  selectedTenantLabel: { ...typography.caption, color: colors.text.secondary, marginBottom: spacing.xs },
  selectedTenantName: { ...typography.h3, color: colors.text.primary },
  unitsList: { padding: spacing.lg },
  unitOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  unitPropertyName: { ...typography.bodySmall, color: colors.text.secondary },
  unitNumber: { ...typography.h3, color: colors.text.primary, marginTop: 2 },
  unitRent: { ...typography.body, fontWeight: '600', color: '#facc15' },
  noUnitsContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  noUnitsTitle: { ...typography.h3, color: colors.text.primary, marginTop: spacing.md, marginBottom: spacing.xs },
  noUnitsSubtitle: { ...typography.body, color: colors.text.secondary, textAlign: 'center' },
  settingsSection: { marginBottom: spacing.lg },
  settingsSectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginLeft: spacing.xs },
  settingsRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  settingsLabel: { ...typography.body, color: colors.text.primary },
  settingsValue: { ...typography.body, color: colors.text.secondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  languageSelector: { gap: spacing.sm },
  languageOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, backgroundColor: colors.surfaceLight },
  languageOptionActive: { backgroundColor: '#facc15' },
  languageText: { ...typography.body, fontWeight: '500', color: colors.text.primary },
  languageTextActive: { color: colors.background, fontWeight: '600' },
  linkSection: { gap: spacing.md },
  linkInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  linkTextContainer: { flex: 1 },
  linkTitle: { ...typography.body, fontWeight: '600', color: colors.text.primary },
  linkDescription: { ...typography.caption, color: colors.text.secondary, marginTop: spacing.xs },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 8, borderWidth: 1, borderColor: '#facc15' },
  copyText: { ...typography.bodySmall, fontWeight: '600', color: '#facc15' },
  copyTextSuccess: { color: colors.success.main },
  signOutSection: { marginTop: spacing.xl },
  footer: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xxl },
});
