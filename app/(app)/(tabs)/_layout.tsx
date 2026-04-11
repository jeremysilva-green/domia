// Force rebundle: 2026-02-04T21:30:00 - All yellow colors are now #facc15
import { useRef, useCallback, useState, useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList, RefreshControl, Image, Modal, Alert, ActivityIndicator, Linking, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import PagerView from 'react-native-pager-view';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useI18n, Language } from '../../../src/i18n';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { StatCard } from '../../../src/components/dashboard';
import { Card, Button, Badge, Input, ConfirmDialog } from '../../../src/components/ui';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CURRENCIES, Currency, getCurrencySymbol, getCurrencyLabel, formatMonthlyRent } from '../../../src/utils/currency';
import { prefillPhone } from '../../../src/utils/phoneCountryCode';
import { playSound } from '../../../src/utils/sounds';
import { setupNotificationChannels, requestNotificationPermissions } from '../../../src/utils/notificationScheduler';
import { AppAlert } from '../../../src/components/ui/AppAlert';

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

const DISPLAY_CURRENCY_KEY = '@domia_display_currency';
const EXCHANGE_RATE_CACHE_KEY = '@domia_exchange_rates';
const EXCHANGE_RATE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetches USD-based exchange rates from the free @fawazahmed0/currency-api (jsDelivr CDN).
 * Results are cached in AsyncStorage for 4 hours. Falls back to a mirror URL if the
 * primary CDN is unavailable. Returns an empty object on total failure (caller must handle).
 */
async function fetchExchangeRates(): Promise<Record<string, number>> {
  try {
    const cached = await AsyncStorage.getItem(EXCHANGE_RATE_CACHE_KEY);
    if (cached) {
      const { timestamp, rates } = JSON.parse(cached);
      if (Date.now() - timestamp < EXCHANGE_RATE_TTL_MS) return rates;
    }
  } catch {}

  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  ];

  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      const rates: Record<string, number> = data.usd; // { "pyg": 7521.3, "eur": 0.92, ... }
      await AsyncStorage.setItem(EXCHANGE_RATE_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), rates }));
      return rates;
    } catch {} finally {
      clearTimeout(timeout);
    }
  }
  return {};
}

/**
 * Converts an amount from one currency to another using USD-based rates.
 * Falls back to a hardcoded USD↔PYG rate if live rates are unavailable.
 */
function convertToDisplayCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  const from = fromCurrency.toLowerCase();
  const to = toCurrency.toLowerCase();
  if (from === to) return amount;

  const fromRate = from === 'usd' ? 1 : rates[from];
  const toRate = to === 'usd' ? 1 : rates[to];

  if (!fromRate || !toRate) {
    // Hardcoded fallback for USD↔PYG only
    if (from === 'usd' && to === 'pyg') return amount * 7500;
    if (from === 'pyg' && to === 'usd') return amount / 7500;
    return amount;
  }

  // amount → USD → toCurrency
  const inUSD = from === 'usd' ? amount : amount / fromRate;
  return to === 'usd' ? inUSD : inUSD * toRate;
}

function formatDisplayCurrency(amount: number, displayCurrency: Currency): string {
  return getCurrencySymbol(displayCurrency) + new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function errorMessage(error: any, t: any): string {
  const msg: string = error?.message || '';
  if (msg.includes('Network request failed')) return t.common.networkError;
  return msg || t.common.networkError;
}

function DashboardContent({ displayCurrency }: { displayCurrency: Currency }) {
  const router = useRouter();
  const { owner, isDemoMode } = useAuthStore();
  const { t, language } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', owner?.id, displayCurrency],
    staleTime: 0,
    queryFn: async () => {
      if (!owner?.id) throw new Error('No owner');
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const exchangeRates = await fetchExchangeRates();

      const [propertiesRes, unitsRes, tenantsRes, paymentsRes, maintenanceRes] =
        await Promise.all([
          supabase.from('properties').select('id').eq('owner_id', owner.id),
          supabase
            .from('units')
            .select('id, status, property_id, rent_amount, currency')
            .in(
              'property_id',
              (await supabase.from('properties').select('id').eq('owner_id', owner.id)).data?.map((p) => p.id) || []
            ),
          supabase.from('tenants').select('id, rent_amount, unit_id').eq('owner_id', owner.id).eq('status', 'active'),
          supabase
            .from('rent_payments')
            .select('amount_due, amount_paid, status, tenant_id')
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

      // Build lookup maps for currency conversion on payments
      const tenantUnitMap: Record<string, string> = Object.fromEntries(
        tenants.map((t: any) => [t.id, t.unit_id])
      );
      const unitCurrencyMap: Record<string, string> = Object.fromEntries(
        units.map((u) => [u.id, (u as any).currency || 'USD'])
      );

      return {
        totalRentExpected: units
          .filter((u) => u.status === 'occupied')
          .reduce((sum, u) => {
            const unitCurrency = (u as any).currency || 'USD';
            const rentAmount = u.rent_amount || 0;
            return sum + convertToDisplayCurrency(rentAmount, unitCurrency, displayCurrency, exchangeRates);
          }, 0),
        totalRentCollected: payments
          .filter((p: any) => p.status === 'paid')
          .reduce((sum, p: any) => {
            const unitId = tenantUnitMap[p.tenant_id];
            const currency = unitCurrencyMap[unitId] || 'USD';
            return sum + convertToDisplayCurrency(p.amount_paid || p.amount_due || 0, currency, displayCurrency, exchangeRates);
          }, 0),
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
    try {
      await Promise.all([refetchStats(), refetchLeases()]);
    } catch (_) {
      // Silently swallow — each query manages its own error state
    } finally {
      setRefreshing(false);
    }
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
          <View style={contentStyles.headerAvatarRow}>
            <View style={contentStyles.ownerNameRow}>
              <Text style={contentStyles.ownerName}>{isDemoMode ? 'Demo' : (owner?.full_name || 'Owner')}</Text>
              {isDemoMode && (
                <View style={contentStyles.demoBadge}>
                  <Text style={contentStyles.demoBadgeText}>{t.demo.badge}</Text>
                </View>
              )}
            </View>
            {owner?.profile_image_url ? (
              <Image source={{ uri: owner.profile_image_url }} style={contentStyles.headerAvatar} />
            ) : (
              <View style={contentStyles.headerAvatarFallback}>
                <Text style={contentStyles.headerAvatarInitials}>
                  {owner?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'O'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={contentStyles.statsRow}>
          <StatCard
            title={language === 'es' ? 'Esperado' : 'Expected'}
            value={formatDisplayCurrency(stats?.totalRentExpected || 0, displayCurrency)}
            subtitle={language === 'es' ? 'Este mes' : 'This month'}
            style={contentStyles.statCard}
          />
          <StatCard
            title={t.home.collected}
            value={formatDisplayCurrency(stats?.totalRentCollected || 0, displayCurrency)}
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

function PropertyCard({ property, onLongPress }: { property: PropertyWithUnits; onLongPress: () => void }) {
  const router = useRouter();
  const occupiedCount = property.units.filter((u: any) =>
    Array.isArray(u.tenants) ? u.tenants.some((t: any) => t.status === 'active') : u.status === 'occupied'
  ).length;
  const totalCount = property.units.length;

  return (
    <Card
      style={contentStyles.propertyCard}
      onPress={() => router.push(`/(app)/property/${property.id}`)}
      onLongPress={onLongPress}
    >
      <View style={contentStyles.propertyHeader}>
        {(property as any).logo_url ? (
          <Image source={{ uri: (property as any).logo_url }} style={contentStyles.propertyLogo} />
        ) : (
          <View style={contentStyles.propertyLogoPlaceholder}>
            <Feather name="home" size={20} color={colors.yellow} />
          </View>
        )}
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
  const { user, isDemoMode } = useAuthStore();
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showDemoLimit, setShowDemoLimit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { data: properties, isLoading, refetch } = useQuery<PropertyWithUnits[]>({
    queryKey: ['properties', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('properties')
        .select(`*, units (id, status, tenants (id, status))`)
        .eq('owner_id', user.id)
        .order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 15000,
  });

  const handleAddProperty = () => {
    if (isDemoMode && (properties?.length ?? 0) >= 1) {
      setShowDemoLimit(true);
      return;
    }
    router.push('/(app)/property/new');
  };

  const [logoProperty, setLogoProperty] = useState<PropertyWithUnits | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleChangeLogo = async () => {
    if (!logoProperty) return;
    setLogoProperty(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setUploadingLogo(true);
    try {
      const fileName = `property-logo-${logoProperty.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(fileName, decode(result.assets[0].base64), { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('property-images').getPublicUrl(fileName);
      await supabase.from('properties').update({ logo_url: urlData.publicUrl } as any).eq('id', logoProperty.id);
      queryClient.invalidateQueries({ queryKey: ['properties', user?.id] });
    } catch (e: any) {
      AppAlert.alert(t.common.error, e.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (_) {
      // Silently swallow — query manages its own error state
    } finally {
      setRefreshing(false);
    }
  };

  const filteredProperties = (properties || []).filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderEmpty = () => (
    <View style={contentStyles.emptyContainer}>
      <Text style={contentStyles.emptyTitle}>{t.properties.noProperties}</Text>
      <Text style={contentStyles.emptySubtitle}>{t.properties.noPropertiesSubtitle}</Text>
      <Button
        title={t.properties.addProperty}
        onPress={handleAddProperty}
        style={contentStyles.emptyButton}
      />
    </View>
  );

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <View style={contentStyles.screenHeader}>
        <Text style={contentStyles.screenTitle}>{t.properties.title}</Text>
        <TouchableOpacity style={contentStyles.addButton} onPress={handleAddProperty}>
          <Text style={contentStyles.addButtonText}>+ {t.common.add}</Text>
        </TouchableOpacity>
      </View>
      <View style={contentStyles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#9ca3af" style={contentStyles.searchIcon} />
        <TextInput
          style={contentStyles.searchInput}
          placeholder="Search properties..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={filteredProperties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PropertyCard property={item} onLongPress={() => setLogoProperty(item)} />
        )}
        contentContainerStyle={contentStyles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
      />

      {/* Change Logo modal */}
      <Modal visible={!!logoProperty} transparent animationType="fade" onRequestClose={() => setLogoProperty(null)}>
        <TouchableOpacity style={contentStyles.logoModalOverlay} activeOpacity={1} onPress={() => setLogoProperty(null)}>
          <View style={contentStyles.logoModalSheet}>
            <Text style={contentStyles.logoModalTitle}>{logoProperty?.name}</Text>
            <TouchableOpacity style={contentStyles.logoModalOption} onPress={handleChangeLogo}>
              <Feather name="image" size={20} color={colors.yellow} />
              <Text style={contentStyles.logoModalOptionText}>
                {language === 'es' ? 'Cambiar Logotipo' : 'Change Logo'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={contentStyles.logoModalCancel} onPress={() => setLogoProperty(null)}>
              <Text style={contentStyles.logoModalCancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={showDemoLimit}
        title={t.demo.limitTitle}
        message={t.demo.limitMessage}
        confirmText={t.demo.createAccount}
        cancelText={t.common.cancel}
        onConfirm={() => { setShowDemoLimit(false); router.push('/(auth)/register'); }}
        onCancel={() => setShowDemoLimit(false)}
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
        <Text style={contentStyles.requestTitle} numberOfLines={1}>{request.title}</Text>
        <StatusBadge status={request.status} type="maintenance" />
      </View>
      <View style={contentStyles.cardFooter}>
        {(request as any).tenant?.full_name && (
          <Text style={contentStyles.requestLocation}>{(request as any).tenant.full_name}</Text>
        )}
        {request.urgency === 'emergency' && (
          <View style={contentStyles.urgencyBadge}>
            <Text style={contentStyles.urgencyText}>Urgent</Text>
          </View>
        )}
        {request.urgency === 'high' && (
          <View style={[contentStyles.urgencyBadge, contentStyles.urgencyHigh]}>
            <Text style={[contentStyles.urgencyText, contentStyles.urgencyTextHigh]}>High</Text>
          </View>
        )}
        <Text style={contentStyles.requestDate}>{format(new Date(request.created_at), 'MMM d, yyyy')}</Text>
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

      if (activeFilter === 'all') {
        query = query.not('status', 'in', '("completed","cancelled")');
      } else {
        query = query.eq('status', activeFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!owner?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (_) {
      // Silently swallow — query manages its own error state
    } finally {
      setRefreshing(false);
    }
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
  units: any[];
}

function NotificationsContent() {
  const router = useRouter();
  const { owner } = useAuthStore();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConnectionRequestWithDetails | null>(null);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<{ request: ConnectionRequestWithDetails } | null>(null);
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null);
  const [inboxTab, setInboxTab] = useState<'inbox' | 'seen'>('inbox');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [expandedDisconnectId, setExpandedDisconnectId] = useState<string | null>(null);

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
      return (data || []) as any[];
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
        .select(`*, units (id, unit_number, status, rent_amount, currency, tenants (id, status))`)
        .eq('owner_id', owner.id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!owner?.id,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const approveRequest = useMutation({
    mutationFn: async ({ requestId, unitId, propertyId, tenantId }: { requestId: string; unitId?: string; propertyId?: string; tenantId?: string }) => {
      let resolvedUnitId = unitId;

      // For house-type properties, find or create a unit representing the house (atomic upsert)
      if (!unitId && propertyId) {
        const { data: houseUnit, error: houseUnitError } = await (supabase.from('units') as any)
          .upsert(
            { property_id: propertyId, unit_number: 'Casa', status: 'vacant', rent_amount: 0 },
            { onConflict: 'property_id,unit_number' }
          )
          .select('id')
          .single();
        if (houseUnitError) throw houseUnitError;
        resolvedUnitId = houseUnit.id;
      }

      if (!resolvedUnitId) throw new Error('No unit selected');

      const { error: requestError } = await supabase
        .from('connection_requests')
        .update({ status: 'approved', unit_id: resolvedUnitId, updated_at: new Date().toISOString(), seen_by_tenant: false } as any)
        .eq('id', requestId);
      if (requestError) throw requestError;

      const { data: request } = await supabase.from('connection_requests').select('*').eq('id', requestId).single();
      if (!request) throw new Error('Request not found');

      const { data: unit } = await supabase.from('units').select('rent_amount').eq('id', resolvedUnitId).single();

      const { error: tenantError } = await (supabase.from('tenants') as any).insert({
        id: request.tenant_id,
        unit_id: resolvedUnitId,
        owner_id: owner!.id,
        full_name: request.tenant_name,
        email: request.tenant_email,
        phone: request.tenant_phone,
        ruc: (request as any).tenant_ruc || null,
        razon_social: (request as any).tenant_razon_social || null,
        rent_amount: unit?.rent_amount || 0,
        status: 'active',
        onboarding_completed: true,
      });
      if (tenantError && !tenantError.message.includes('duplicate')) throw tenantError;

      const { error: unitError } = await supabase.from('units').update({ status: 'occupied' }).eq('id', resolvedUnitId);
      if (unitError) throw unitError;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setShowUnitModal(false);
      setSelectedRequest(null);

      AppAlert.alert(t.common.success, t.notifications.approvalSuccess);
    },
    onError: (error: any) => AppAlert.alert(t.common.error, errorMessage(error, t)),
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from('connection_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString(), seen_by_tenant: false } as any)
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-connections-count'] });
      setInfoDialog({ title: t.common.done, message: t.notifications.declineSuccess });
    },
    onError: (error: any) => AppAlert.alert(t.common.error, errorMessage(error, t)),
  });

  const { data: paymentProofs } = useQuery({
    queryKey: ['owner-payment-proofs', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];
      // Fetch payments that have an unseen rent proof OR unseen services proof
      const { data } = await supabase
        .from('rent_payments')
        .select('*, tenant:tenants!inner(id, full_name, owner_id, rent_amount)')
        .eq('tenant.owner_id', owner.id)
        .or('and(proof_image_url.not.is.null,proof_seen_by_owner.eq.false),and(services_proof_image_url.not.is.null,services_proof_seen_by_owner.eq.false)')
        .order('updated_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!owner?.id,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async ({ paymentId, amountDue }: { paymentId: string; amountDue: number }) => {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('rent_payments')
        .update({ status: 'paid', paid_date: today, proof_seen_by_owner: true, amount_paid: amountDue })
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      playSound('paid');
      queryClient.invalidateQueries({ queryKey: ['owner-payment-proofs', owner?.id] });
      queryClient.invalidateQueries({ queryKey: ['unseen-payment-proofs-count', owner?.id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const confirmServicesProofMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('rent_payments')
        .update({ services_proof_seen_by_owner: true } as any)
        .eq('id', paymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-payment-proofs', owner?.id] });
      queryClient.invalidateQueries({ queryKey: ['unseen-payment-proofs-count', owner?.id] });
    },
  });

  const { data: disconnectionRequests } = useQuery({
    queryKey: ['owner-disconnection-requests', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return [];
      const { data } = await supabase
        .from('disconnection_requests')
        .select('*')
        .eq('owner_id', owner.id)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!owner?.id,
    refetchInterval: 30000,
    staleTime: 0,
  });

  const acknowledgeDisconnectMutation = useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      // 1. Find the connection request for this tenant to get unit_id
      const { data: connReq } = await supabase
        .from('connection_requests')
        .select('id, unit_id')
        .eq('tenant_id', tenantId)
        .single();

      const unitId = connReq?.unit_id ?? null;

      // 2. Set unit back to vacant
      if (unitId) {
        const { error: unitError } = await supabase
          .from('units')
          .update({ status: 'vacant' })
          .eq('id', unitId);
        if (unitError) throw unitError;
      }

      // 3. Delete tenant record
      const { error: tenantError } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);
      if (tenantError) throw tenantError;

      // 4. Delete connection request
      if (connReq?.id) {
        await supabase
          .from('connection_requests')
          .delete()
          .eq('id', connReq.id);
      }

      // 5. Mark disconnection request as acknowledged
      const { error } = await supabase
        .from('disconnection_requests')
        .update({ acknowledged: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['owner-disconnection-requests', owner?.id] });
      queryClient.invalidateQueries({ queryKey: ['unseen-disconnections-count', owner?.id] });
      queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
    },
    onError: (error: any) => AppAlert.alert(t.common.error, errorMessage(error, t)),
  });

  const handleApprove = (request: ConnectionRequestWithDetails) => {
    setSelectedRequest(request);
    setShowUnitModal(true);
  };

  const handleReject = (request: ConnectionRequestWithDetails) => {
    setRejectDialog({ request });
  };

  const handleSelectUnit = (item: { id: string; isHouseProperty?: boolean; propertyId?: string }) => {
    if (!selectedRequest) return;
    if (item.isHouseProperty && item.propertyId) {
      approveRequest.mutate({ requestId: selectedRequest.id, propertyId: item.propertyId, tenantId: selectedRequest.tenant_id });
    } else {
      approveRequest.mutate({ requestId: selectedRequest.id, unitId: item.id, tenantId: selectedRequest.tenant_id });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } catch (_) {
      // Silently swallow — query manages its own error state
    } finally {
      setRefreshing(false);
    }
  };

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const seenRequests = requests?.filter((r) => r.status !== 'pending') || [];
  const isUnitVacant = (u: any) =>
    Array.isArray(u.tenants) ? !u.tenants.some((t: any) => t.status === 'active') : u.status === 'vacant';
  const vacantUnits = properties?.flatMap((p): any[] => {
    if ((p as any).property_type === 'house') {
      const isOccupied = p.units.some((u: any) => !isUnitVacant(u));
      if (!isOccupied) {
        return [{ id: `house-${p.id}`, unit_number: 'Casa', status: 'vacant', rent_amount: null, currency: null, propertyName: p.name, isHouseProperty: true, propertyId: p.id }];
      }
      return [];
    }
    return p.units.filter((u: any) => isUnitVacant(u)).map((u: any) => ({ ...u, propertyName: p.name, propertyId: p.id }));
  }) || [];

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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={contentStyles.screenTitle}>{t.notifications.title}</Text>
          {pendingRequests.length > 0 && (
            <View style={contentStyles.countBadge}>
              <Text style={contentStyles.countText}>{pendingRequests.length}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={contentStyles.inboxTabRow}>
        <TouchableOpacity
          style={[contentStyles.inboxTabBtn, inboxTab === 'inbox' && contentStyles.inboxTabBtnActive]}
          onPress={() => setInboxTab('inbox')}
        >
          <Text style={[contentStyles.inboxTabText, inboxTab === 'inbox' && contentStyles.inboxTabTextActive]}>
            {t.notifications.title}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[contentStyles.inboxTabBtn, inboxTab === 'seen' && contentStyles.inboxTabBtnActive]}
          onPress={() => setInboxTab('seen')}
        >
          <Text style={[contentStyles.inboxTabText, inboxTab === 'seen' && contentStyles.inboxTabTextActive]}>
            {t.notifications.seen}
          </Text>
          {seenRequests.length > 0 && (
            <View style={contentStyles.seenCount}>
              <Text style={contentStyles.seenCountText}>{seenRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={inboxTab === 'inbox' ? pendingRequests : seenRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequest}
        contentContainerStyle={contentStyles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!isLoading ? renderEmpty : null}
        ListHeaderComponent={
          <>
            {inboxTab === 'inbox' && disconnectionRequests && disconnectionRequests.length > 0 && (
              <View>
                <Text style={contentStyles.listSectionTitle}>{t.disconnectionRequests.sectionTitle}</Text>
                {disconnectionRequests.map((req: any) => (
                  <Card key={req.id} style={contentStyles.notifCard}>
                    <View style={contentStyles.notifHeader}>
                      <View style={contentStyles.notifInfo}>
                        <Text style={contentStyles.notifName}>{req.tenant_name}</Text>
                        <Text style={contentStyles.notifEmail}>{req.tenant_email}</Text>
                        {req.unit_info && <Text style={contentStyles.notifPhone}>{req.unit_info}</Text>}
                      </View>
                      <Badge label={t.disconnectionRequests.sectionTitle} variant="error" size="sm" />
                    </View>
                    <TouchableOpacity
                      onPress={() => setExpandedDisconnectId(expandedDisconnectId === req.id ? null : req.id)}
                      style={contentStyles.disconnectReasonRow}
                    >
                      <Text style={contentStyles.disconnectReasonLabel}>{t.disconnectionRequests.reason}</Text>
                      <Feather
                        name={expandedDisconnectId === req.id ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                    {expandedDisconnectId === req.id && (
                      <Text style={contentStyles.disconnectReasonText}>{req.reason}</Text>
                    )}
                    <Text style={contentStyles.notifDate}>{new Date(req.created_at).toLocaleDateString()}</Text>
                    <Button
                      title={t.disconnectionRequests.acknowledge}
                      size="sm"
                      onPress={() => acknowledgeDisconnectMutation.mutate({ id: req.id, tenantId: req.tenant_id })}
                      loading={acknowledgeDisconnectMutation.isPending}
                      style={contentStyles.disconnectAckBtn}
                    />
                    {req.tenant_phone && (
                      <Button
                        title={t.disconnectionRequests.whatsapp}
                        size="sm"
                        variant="outline"
                        onPress={() => {
                          const digits = req.tenant_phone.replace(/[^0-9]/g, '');
                          Linking.openURL(`https://wa.me/${digits}`);
                        }}
                        style={contentStyles.whatsappBtn}
                        textStyle={contentStyles.whatsappBtnText}
                      />
                    )}
                  </Card>
                ))}
              </View>
            )}
            {inboxTab === 'inbox' && paymentProofs && paymentProofs.length > 0 && (
              <View>
                <Text style={contentStyles.listSectionTitle}>{t.payments.title}</Text>
                {paymentProofs.map((payment: any) => (
                  <Card key={payment.id} style={contentStyles.notifCard}>
                    <View style={contentStyles.notifHeader}>
                      <View style={contentStyles.notifInfo}>
                        <Text style={contentStyles.notifName}>{payment.tenant?.full_name}</Text>
                        <Text style={contentStyles.notifEmail}>
                          {t.payments.dueOn} {new Date(payment.due_date).toLocaleDateString()} · {payment.amount_due?.toLocaleString()}
                        </Text>
                      </View>
                      <Badge label={t.payments.pendingConfirmation} variant="warning" size="sm" />
                    </View>

                    {/* Rent proof */}
                    {payment.proof_image_url && !payment.proof_seen_by_owner && (
                      <>
                        <Text style={contentStyles.proofLabel}>{t.payments.title}</Text>
                        <TouchableOpacity onPress={() => setProofPreviewUrl(payment.proof_image_url)}>
                          <Image source={{ uri: payment.proof_image_url }} style={contentStyles.proofThumbnail} resizeMode="cover" />
                        </TouchableOpacity>
                        <View style={contentStyles.notifActions}>
                          <Button
                            title={t.payments.markPaid}
                            size="sm"
                            onPress={() => confirmPaymentMutation.mutate({ paymentId: payment.id, amountDue: payment.amount_due || payment.tenant?.rent_amount || 0 })}
                            loading={confirmPaymentMutation.isPending}
                            style={contentStyles.actionButton}
                          />
                        </View>
                      </>
                    )}

                    {/* Services proof */}
                    {payment.services_proof_image_url && !payment.services_proof_seen_by_owner && (
                      <>
                        <Text style={contentStyles.proofLabel}>{t.payments.utilities}</Text>
                        <TouchableOpacity onPress={() => setProofPreviewUrl(payment.services_proof_image_url)}>
                          <Image source={{ uri: payment.services_proof_image_url }} style={contentStyles.proofThumbnail} resizeMode="cover" />
                        </TouchableOpacity>
                        <View style={contentStyles.notifActions}>
                          <Button
                            title={t.common.confirm}
                            size="sm"
                            onPress={() => confirmServicesProofMutation.mutate(payment.id)}
                            loading={confirmServicesProofMutation.isPending}
                            style={contentStyles.actionButton}
                          />
                        </View>
                      </>
                    )}
                  </Card>
                ))}
              </View>
            )}
            {inboxTab === 'inbox' && pendingRequests.length > 0 && <Text style={contentStyles.listSectionTitle}>{t.notifications.pendingRequests}</Text>}
          </>
        }
      />
      {/* Proof image preview modal */}
      <Modal visible={!!proofPreviewUrl} transparent animationType="fade" onRequestClose={() => setProofPreviewUrl(null)}>
        <View style={contentStyles.proofModalOverlay}>
          <TouchableOpacity style={contentStyles.proofModalClose} onPress={() => setProofPreviewUrl(null)}>
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
          {proofPreviewUrl && (
            <Image source={{ uri: proofPreviewUrl }} style={contentStyles.proofModalImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
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
          {(() => {
            const unitsForRequest = selectedRequest?.property_id
              ? vacantUnits.filter((u: any) => u.propertyId === selectedRequest.property_id)
              : vacantUnits;
            return unitsForRequest.length > 0 ? (
            <FlatList
              data={unitsForRequest}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={contentStyles.unitOption} onPress={() => handleSelectUnit(item)} disabled={approveRequest.isPending}>
                  <View>
                    <Text style={contentStyles.unitPropertyName}>{item.propertyName}</Text>
                    <Text style={contentStyles.unitNumber}>{item.unit_number}</Text>
                  </View>
                  {item.rent_amount ? <Text style={contentStyles.unitRent}>{formatMonthlyRent(item.rent_amount, item.currency)}</Text> : null}
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
          );
          })()}
        </SafeAreaView>
      </Modal>
      <ConfirmDialog
        visible={!!rejectDialog}
        title={t.notifications.declineConfirm}
        message={`${t.notifications.declineConfirmMsg} ${rejectDialog?.request.tenant_name}?`}
        confirmText={t.notifications.decline}
        cancelText={t.common.cancel}
        destructive
        onConfirm={() => { rejectRequest.mutate(rejectDialog!.request.id); setRejectDialog(null); }}
        onCancel={() => setRejectDialog(null)}
      />
      <ConfirmDialog
        visible={!!infoDialog}
        title={infoDialog?.title ?? ''}
        message={infoDialog?.message}
        confirmText="OK"
        hideCancel
        onConfirm={() => setInfoDialog(null)}
        onCancel={() => setInfoDialog(null)}
      />
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

function SettingsContent({ displayCurrency, onChangeCurrency }: { displayCurrency: Currency; onChangeCurrency: (c: Currency) => void }) {
  const { owner, signOut, deleteAccount, isLoading, fetchOwnerProfile } = useAuthStore();
  const { t, language, setLanguage } = useI18n();

  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [isBankEditing, setIsBankEditing] = useState(false);
  const [bankAlias, setBankAlias] = useState(owner?.bank_alias || '');
  const [savingBank, setSavingBank] = useState(false);
  const [isPhoneEditing, setIsPhoneEditing] = useState(false);
  const [phoneValue, setPhoneValue] = useState(prefillPhone(owner?.phone));
  const [savingPhone, setSavingPhone] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      AppAlert.alert(t.common.error, 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.4,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      const filePath = `owner-${owner!.id}.${ext}`;

      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, decode(base64), { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('owners')
        .update({ profile_image_url: publicUrl } as any)
        .eq('id', owner!.id);

      if (updateError) throw updateError;
      await fetchOwnerProfile();
    } catch (err: any) {
      AppAlert.alert(t.common.error, err.message || 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const generateVistaGlobal = async () => {
    if (!owner?.id) return;
    setIsGeneratingPDF(true);
    try {
      const { data: properties, error } = await supabase
        .from('properties')
        .select(`
          id, name, address, city, property_type,
          units (
            id, unit_number, rent_amount, currency,
            tenants (
              id, full_name, email, phone, rent_amount, lease_start, lease_end, status,
              rent_payments (id, period_month, period_year, amount_due, amount_paid, status, paid_date, due_date, proof_image_url, services_proof_image_url),
              maintenance_requests (id)
            )
          )
        `)
        .eq('owner_id', owner.id)
        .order('name');

      if (error) throw error;

      const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
      const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

      let propertiesHtml = '';
      for (const prop of (properties || []) as any[]) {
        const units = prop.units || [];
        let unitsHtml = '';

        for (const unit of units) {
          const activeTenant = (unit.tenants || []).find((t: any) => t.status === 'active');
          let tenantHtml = `<div class="no-tenant">Unidad vacante</div>`;

          if (activeTenant) {
            const payments: any[] = activeTenant.rent_payments || [];
            let onTime = 0, late = 0, totalPaid = 0;

            for (const p of payments.filter((p: any) => p.status === 'paid')) {
              totalPaid += p.amount_paid || p.amount_due || 0;
              if (p.paid_date && p.due_date && new Date(p.paid_date) > new Date(p.due_date)) {
                late++;
              } else {
                onTime++;
              }
            }

            const maintCount = (activeTenant.maintenance_requests || []).length;
            const sorted = [...payments].sort((a: any, b: any) => {
              const o: Record<string, number> = { paid: 0, due: 1, overdue: 2 };
              if (a.status === 'paid' && b.status === 'paid') {
                const aLate = a.paid_date && a.due_date && new Date(a.paid_date) > new Date(a.due_date);
                const bLate = b.paid_date && b.due_date && new Date(b.paid_date) > new Date(b.due_date);
                return (aLate ? 1 : 0) - (bLate ? 1 : 0);
              }
              return (o[a.status] ?? 3) - (o[b.status] ?? 3);
            });

            const paymentsHtml = sorted.length > 0 ? `
              <table class="pt">
                <thead><tr><th>Período</th><th>Monto</th><th>Estado</th><th>Fecha pago</th><th>Comprobantes</th></tr></thead>
                <tbody>
                  ${sorted.map((p: any) => {
                    const period = `${monthNames[(p.period_month || 1) - 1]} ${p.period_year}`;
                    const amt = (p.amount_paid || p.amount_due || 0).toLocaleString();
                    let cls = 'due', lbl = 'Pendiente';
                    if (p.status === 'paid') {
                      const isLate = p.paid_date && p.due_date && new Date(p.paid_date) > new Date(p.due_date);
                      cls = isLate ? 'late' : 'ontime'; lbl = isLate ? 'Con retraso' : 'A tiempo';
                    } else if (p.status === 'overdue') { cls = 'due'; lbl = 'Vencido'; }
                    const rentLink = p.proof_image_url ? `<a href="${p.proof_image_url}" style="color:#2563eb;font-size:10px;">🔗 Comprobante</a>` : '';
                    const svcLink = p.services_proof_image_url ? `<a href="${p.services_proof_image_url}" style="color:#2563eb;font-size:10px;">🔗 Servicios</a>` : '';
                    const links = [rentLink, svcLink].filter(Boolean).join(' ');
                    return `<tr><td>${period}</td><td>${unit.currency || 'USD'} ${amt}</td><td><span class="b b-${cls}">${lbl}</span></td><td>${p.paid_date || '-'}</td><td>${links}</td></tr>`;
                  }).join('')}
                </tbody>
              </table>` : '';

            tenantHtml = `
              <div class="ts">
                <div class="tn">${activeTenant.full_name || 'Sin nombre'}</div>
                <div class="tm">${[activeTenant.email, activeTenant.phone].filter(Boolean).join(' · ')}</div>
                <div class="sr">
                  <div class="sb"><div class="sl">Pagos a tiempo</div><div class="sv g">${onTime}</div></div>
                  <div class="sb"><div class="sl">Con retraso</div><div class="sv o">${late}</div></div>
                  <div class="sb"><div class="sl">Mant.</div><div class="sv bl">${maintCount}</div></div>
                  <div class="sb"><div class="sl">Ingresos</div><div class="sv">${unit.currency || 'USD'} ${totalPaid.toLocaleString()}</div></div>
                </div>
                ${paymentsHtml}
              </div>`;
          }

          unitsHtml += `
            <div class="unit">
              <div class="uh"><span>${unit.unit_number}</span><span>${unit.currency || 'USD'} ${(unit.rent_amount || 0).toLocaleString()}/mes</span></div>
              ${tenantHtml}
            </div>`;
        }

        if (units.length === 0) unitsHtml = `<div class="no-tenant">Sin unidades</div>`;

        propertiesHtml += `
          <div class="prop">
            <div class="pt-title">${prop.name}</div>
            <div class="pa">${prop.address}${prop.city ? `, ${prop.city}` : ''}</div>
            ${unitsHtml}
          </div>`;
      }

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:20px;font-size:13px}
        h1{font-size:22px;margin:0 0 2px}
        .sub{color:#666;font-size:12px;margin-bottom:20px}
        .prop{margin-bottom:24px}
        .pt-title{background:#1a1a2e;color:#facc15;padding:7px 12px;border-radius:6px;font-size:14px;font-weight:700;margin-bottom:6px}
        .pa{color:#777;font-size:11px;margin-bottom:8px}
        .unit{border:1px solid #e5e7eb;border-radius:6px;margin-bottom:8px;overflow:hidden}
        .uh{background:#f3f4f6;padding:7px 12px;display:flex;justify-content:space-between;font-size:12px;font-weight:700}
        .ts{padding:10px 12px}
        .tn{font-size:13px;font-weight:700;margin-bottom:2px}
        .tm{font-size:11px;color:#888;margin-bottom:8px}
        .sr{display:flex;gap:8px;margin-bottom:8px}
        .sb{flex:1;background:#f9fafb;border-radius:4px;padding:5px 8px}
        .sl{font-size:10px;color:#888}
        .sv{font-size:13px;font-weight:700}
        .sv.g{color:#16a34a}.sv.o{color:#d97706}.sv.bl{color:#2563eb}
        .pt{width:100%;border-collapse:collapse;font-size:11px}
        .pt th{background:#f3f4f6;padding:4px 8px;text-align:left;color:#555;font-weight:600}
        .pt td{padding:4px 8px;border-bottom:1px solid #f3f4f6}
        .b{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700}
        .b-ontime{background:#dcfce7;color:#16a34a}
        .b-late{background:#fef3c7;color:#d97706}
        .b-due{background:#fee2e2;color:#dc2626}
        .no-tenant{color:#aaa;font-style:italic;font-size:12px;padding:8px 12px}
      </style></head><body>
        <h1>Vista Global · Domia</h1>
        <div class="sub">${owner.full_name || ''} · ${dateStr}</div>
        ${propertiesHtml || '<p>No hay propiedades registradas.</p>'}
      </body></html>`;

      const { printToFileAsync } = await import('expo-print');
      const { shareAsync } = await import('expo-sharing');
      const { uri } = await printToFileAsync({ html, base64: false });
      await shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Vista Global · Domia',
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      AppAlert.alert('Error', e.message || 'No se pudo generar el reporte.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSaveBankInfo = async () => {
    setSavingBank(true);
    try {
      const { error } = await supabase
        .from('owners')
        .update({ bank_alias: bankAlias })
        .eq('id', owner!.id);
      if (error) throw error;
      await fetchOwnerProfile();
      setIsBankEditing(false);
    } catch (e: any) {
      AppAlert.alert('Error', e.message);
    } finally {
      setSavingBank(false);
    }
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from('owners')
        .update({ phone: phoneValue.trim() })
        .eq('id', owner!.id);
      if (error) throw error;
      await fetchOwnerProfile();
      setIsPhoneEditing(false);
    } catch (e: any) {
      AppAlert.alert('Error', e.message);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSignOut = () => {
    AppAlert.alert(t.auth.logout, t.auth.logoutConfirm, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.auth.logout, style: 'destructive', onPress: signOut },
    ]);
  };

  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  const handleDeleteAccount = () => {
    // Step 2: final confirmation after user dismissed subscription warning
    AppAlert.alert(
      (t.settings as any).deleteAccountConfirmTitle,
      (t.settings as any).deleteAccountConfirmMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: (t.settings as any).deleteAccount,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
            } catch {
              AppAlert.alert(t.common.error, (t.settings as any).deleteAccountFailed);
            }
          },
        },
      ]
    );
  };

  const toggleLanguage = (lang: Language) => setLanguage(lang);

  return (
    <SafeAreaView style={contentStyles.container} edges={['top']}>
      <ScrollView style={contentStyles.scrollView} contentContainerStyle={contentStyles.content} showsVerticalScrollIndicator={false}>
        <Text style={contentStyles.screenTitle}>{t.settings.title}</Text>

        <View style={contentStyles.profileAvatarSection}>
          <TouchableOpacity style={contentStyles.avatarContainer} onPress={handlePickPhoto} disabled={uploadingPhoto}>
            {owner?.profile_image_url ? (
              <Image source={{ uri: owner.profile_image_url }} style={contentStyles.avatar} />
            ) : (
              <View style={contentStyles.avatarFallback}>
                <Text style={contentStyles.avatarInitials}>
                  {(owner?.full_name || 'O').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={contentStyles.avatarCameraOverlay}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Feather name="camera" size={14} color="#ffffff" />}
            </View>
          </TouchableOpacity>
          <Text style={contentStyles.avatarName}>{owner?.full_name}</Text>
          <Text style={contentStyles.avatarEmail}>{owner?.email}</Text>
        </View>

        <View style={contentStyles.settingsSection}>
          <Card>
            <TouchableOpacity
              style={contentStyles.displayCurrencyRow}
              onPress={() => setShowCurrencyModal(true)}
            >
              <Text style={contentStyles.settingsLabel}>
                {language === 'es' ? 'Moneda de visualización' : 'Display Currency'}
              </Text>
              <View style={contentStyles.displayCurrencySelector}>
                <Text style={contentStyles.displayCurrencySelectorText}>{getCurrencyLabel(displayCurrency)}</Text>
                <Text style={contentStyles.displayCurrencyChevron}>▼</Text>
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        <View style={contentStyles.settingsSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={contentStyles.settingsSectionTitle}>{t.settings.account}</Text>
            {!isPhoneEditing && (
              <TouchableOpacity onPress={() => { setPhoneValue(prefillPhone(owner?.phone)); setIsPhoneEditing(true); }}>
                <Text style={contentStyles.editLink}>{t.common.edit}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Card>
            <SettingsRow label={t.settings.name} value={owner?.full_name} />
            <View style={contentStyles.divider} />
            <SettingsRow label={t.settings.email} value={owner?.email} />
            <View style={contentStyles.divider} />
            {isPhoneEditing ? (
              <>
                <Input
                  label={t.settings.phone}
                  value={phoneValue}
                  onChangeText={setPhoneValue}
                  keyboardType="phone-pad"
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <Button title={t.common.cancel} variant="outline" onPress={() => setIsPhoneEditing(false)} style={{ flex: 1 }} />
                  <Button title={t.common.save} onPress={handleSavePhone} loading={savingPhone} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <SettingsRow label={t.settings.phone} value={owner?.phone || t.common.notSet} />
            )}
          </Card>
        </View>

        <View style={contentStyles.settingsSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={contentStyles.settingsSectionTitle}>{t.bankInfo.title}</Text>
            {!isBankEditing && (
              <TouchableOpacity onPress={() => setIsBankEditing(true)}>
                <Text style={contentStyles.editLink}>{t.common.edit}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Card>
            {isBankEditing ? (
              <>
                <Input label={t.bankInfo.alias} value={bankAlias} onChangeText={setBankAlias} />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <Button title={t.common.cancel} variant="outline" onPress={() => setIsBankEditing(false)} style={{ flex: 1 }} />
                  <Button title={t.common.save} onPress={handleSaveBankInfo} loading={savingBank} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <SettingsRow label={t.bankInfo.alias} value={owner?.bank_alias || '-'} />
            )}
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
          <Button
            title={isGeneratingPDF ? (language === 'es' ? 'Generando...' : 'Generating...') : (language === 'es' ? 'Vista Global' : 'Macro View')}
            onPress={generateVistaGlobal}
            loading={isGeneratingPDF}
            fullWidth
          />
        </View>

        <View style={contentStyles.privacySection}>
          <TouchableOpacity onPress={() => Linking.openURL('https://six-frame-e12.notion.site/Privacy-Policy-7250559bfbeb830ea06401cdbc8467d9?source=copy_link')}>
            <Text style={contentStyles.privacyLink}>{t.settings.privacyPolicy}</Text>
          </TouchableOpacity>
        </View>

        <View style={contentStyles.signOutSection}>
          <Button title={t.auth.logout} onPress={handleSignOut} variant="outline" loading={isLoading} fullWidth />
        </View>

        <View style={contentStyles.deleteAccountSection}>
          <TouchableOpacity
            style={contentStyles.deleteAccountBtn}
            onPress={() => setShowDeleteWarning(true)}
            activeOpacity={0.7}
          >
            <Text style={contentStyles.deleteAccountBtnText}>{(t.settings as any).deleteAccount}</Text>
          </TouchableOpacity>
        </View>

        <Text style={contentStyles.versionText}>{t.settings.version} 1.0.0</Text>
        <Text style={contentStyles.footer}>{t.settings.footer}</Text>
      </ScrollView>

      {/* Delete Account — Step 1: Subscription Warning Modal */}
      <Modal
        visible={showDeleteWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteWarning(false)}
      >
        <View style={contentStyles.deleteModalOverlay}>
          <View style={contentStyles.deleteModalCard}>
            <Text style={contentStyles.deleteModalTitle}>
              {(t.settings as any).deleteAccountWarningTitle}
            </Text>
            <Text style={contentStyles.deleteModalBody}>
              {(t.settings as any).deleteAccountWarningBody}
            </Text>
            <TouchableOpacity
              style={contentStyles.manageSubBtn}
              onPress={() => Linking.openURL('https://play.google.com/store/account/subscriptions')}
              activeOpacity={0.8}
            >
              <Text style={contentStyles.manageSubBtnText}>
                {(t.settings as any).manageSubscription}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={contentStyles.continueDeleteBtn}
              onPress={() => {
                setShowDeleteWarning(false);
                handleDeleteAccount();
              }}
              activeOpacity={0.8}
            >
              <Text style={contentStyles.continueDeleteBtnText}>
                {(t.settings as any).continueToDelete}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={contentStyles.cancelDeleteBtn}
              onPress={() => setShowDeleteWarning(false)}
              activeOpacity={0.7}
            >
              <Text style={contentStyles.cancelDeleteBtnText}>{t.common.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <TouchableOpacity
          style={contentStyles.currencyPickerOverlay}
          activeOpacity={1}
          onPress={() => setShowCurrencyModal(false)}
        >
          <View style={contentStyles.currencyPickerContainer}>
            <View style={contentStyles.currencyPickerHeader}>
              <Text style={contentStyles.currencyPickerTitle}>
                {language === 'es' ? 'Moneda de visualización' : 'Display Currency'}
              </Text>
              <TouchableOpacity onPress={() => setShowCurrencyModal(false)}>
                <Text style={contentStyles.currencyPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    contentStyles.currencyPickerItem,
                    displayCurrency === c.code && contentStyles.currencyPickerItemActive,
                  ]}
                  onPress={() => {
                    onChangeCurrency(c.code as Currency);
                    setShowCurrencyModal(false);
                  }}
                >
                  <Text
                    style={[
                      contentStyles.currencyPickerItemText,
                      displayCurrency === c.code && contentStyles.currencyPickerItemTextActive,
                    ]}
                  >
                    {c.symbol}  {c.code} — {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
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
  const queryClient = useQueryClient();
  const pagerRef = useRef<PagerView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('PYG');

  useEffect(() => {
    AsyncStorage.getItem(DISPLAY_CURRENCY_KEY).then((val) => {
      if (val) setDisplayCurrency(val as Currency);
    });
    setupNotificationChannels();
    requestNotificationPermissions();
  }, []);

  // Global real-time subscription — lives here so it's always active regardless of which tab is open
  useEffect(() => {
    if (!owner?.id) return;
    const channel = supabase
      .channel(`owner-global-rt-${owner.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'connection_requests', filter: `owner_id=eq.${owner.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['unseen-connections-count'] });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_requests', filter: `owner_id=eq.${owner.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['unseen-maintenance-count'] });
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rent_payments' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['unseen-payment-proofs-count'] });
          queryClient.invalidateQueries({ queryKey: ['owner-payment-proofs'] });
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'units' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['properties'] });
          queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tenants', filter: `owner_id=eq.${owner.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['expiring-leases'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
          queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
          queryClient.invalidateQueries({ queryKey: ['owner-payment-proofs'] });
          queryClient.invalidateQueries({ queryKey: ['connection-requests'] });
          queryClient.invalidateQueries({ queryKey: ['properties'] });
          queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
          queryClient.invalidateQueries({ queryKey: ['unseen-payment-proofs-count'] });
          queryClient.invalidateQueries({ queryKey: ['unseen-connections-count'] });
          queryClient.invalidateQueries({ queryKey: ['unseen-maintenance-count'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [owner?.id, queryClient]);

  const handleChangeCurrency = useCallback(async (currency: Currency) => {
    setDisplayCurrency(currency);
    await AsyncStorage.setItem(DISPLAY_CURRENCY_KEY, currency);
  }, []);

  const { data: unseenConnectionsCount } = useQuery({
    queryKey: ['unseen-connections-count', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return 0;
      const { count } = await supabase
        .from('connection_requests')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', owner.id)
        .eq('seen_by_owner', false);
      return count || 0;
    },
    enabled: !!owner?.id,
    staleTime: 0,
  });

  const { data: unseenMaintenanceCount } = useQuery({
    queryKey: ['unseen-maintenance-count', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return 0;
      const { count } = await supabase
        .from('maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', owner.id)
        .eq('seen_by_owner', false);
      return count || 0;
    },
    enabled: !!owner?.id,
    staleTime: 0,
  });

  const { data: unseenPaymentProofsCount } = useQuery({
    queryKey: ['unseen-payment-proofs-count', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return 0;
      const tenantIds = (await supabase.from('tenants').select('id').eq('owner_id', owner.id)).data?.map((t) => t.id) || [];
      if (tenantIds.length === 0) return 0;
      const { count } = await supabase
        .from('rent_payments')
        .select('*', { count: 'exact', head: true })
        .in('tenant_id', tenantIds)
        .not('proof_image_url', 'is', null)
        .eq('proof_seen_by_owner', false);
      return count || 0;
    },
    enabled: !!owner?.id,
    staleTime: 0,
  });

  const { data: unseenDisconnectionCount } = useQuery({
    queryKey: ['unseen-disconnection-count', owner?.id],
    queryFn: async () => {
      if (!owner?.id) return 0;
      const { count } = await supabase
        .from('disconnection_requests')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', owner.id)
        .eq('acknowledged', false);
      return count || 0;
    },
    enabled: !!owner?.id,
    staleTime: 0,
    refetchInterval: 30000,
  });

  // Mark tab items as seen when owner opens the tab
  useEffect(() => {
    if (!owner?.id) return;

    // TABS index 1 = properties, index 2 = maintenance, index 3 = notifications
    if (currentIndex === 1) {
      queryClient.invalidateQueries({ queryKey: ['properties', owner.id] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units', owner.id] });
    } else if (currentIndex === 3) {
      supabase
        .from('connection_requests')
        .update({ seen_by_owner: true } as any)
        .eq('owner_id', owner.id)
        .eq('seen_by_owner', false)
        .then(() => queryClient.invalidateQueries({ queryKey: ['unseen-connections-count', owner.id] }));
      queryClient.invalidateQueries({ queryKey: ['unseen-payment-proofs-count', owner.id] });
      queryClient.invalidateQueries({ queryKey: ['owner-payment-proofs', owner.id] });
      queryClient.invalidateQueries({ queryKey: ['owner-disconnection-requests', owner.id] });
      queryClient.invalidateQueries({ queryKey: ['unseen-disconnection-count', owner.id] });
    } else if (currentIndex === 2) {
      supabase
        .from('maintenance_requests')
        .update({ seen_by_owner: true } as any)
        .eq('owner_id', owner.id)
        .eq('seen_by_owner', false)
        .then(() => queryClient.invalidateQueries({ queryKey: ['unseen-maintenance-count', owner.id] }));
    }
  }, [currentIndex, owner?.id, queryClient]);

  const handlePageSelected = useCallback((e: { nativeEvent: { position: number } }) => {
    setCurrentIndex(e.nativeEvent.position);
  }, []);

  const handleTabPress = useCallback((index: number) => {
    pagerRef.current?.setPage(index);
  }, []);

  const badgeCounts: Record<string, number> = {
    notifications: (unseenConnectionsCount || 0) + (unseenPaymentProofsCount || 0) + (unseenDisconnectionCount || 0),
    maintenance: unseenMaintenanceCount || 0,
  };

  const prevNotifCount = useRef<number>(0);
  const prevMaintenanceCount = useRef<number>(0);

  useEffect(() => {
    const current = badgeCounts.notifications;
    if (prevNotifCount.current !== undefined && current > prevNotifCount.current) {
      playSound('notification');
    }
    prevNotifCount.current = current;
  }, [badgeCounts.notifications]);

  useEffect(() => {
    const current = badgeCounts.maintenance;
    if (prevMaintenanceCount.current !== undefined && current > prevMaintenanceCount.current) {
      playSound('request');
    }
    prevMaintenanceCount.current = current;
  }, [badgeCounts.maintenance]);

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
          <DashboardContent displayCurrency={displayCurrency} />
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
          <SettingsContent displayCurrency={displayCurrency} onChangeCurrency={handleChangeCurrency} />
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
                    size={35}
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
  ownerNameRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.xs },
  demoBadge: { backgroundColor: '#22c55e', paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full },
  demoBadgeText: { fontSize: 10, fontWeight: '700' as const, color: '#fff', letterSpacing: 0.8 },
  headerAvatarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.yellow, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerAvatarInitials: { ...typography.bodySmall, fontWeight: '700' as const, color: colors.background },
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
  searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  searchIcon: { marginRight: spacing.sm },
  searchInput: { flex: 1, height: 40, ...typography.body, color: colors.text.primary },
  list: { padding: spacing.lg, paddingTop: 0 },
  propertyCard: { marginBottom: spacing.md, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#facc1566' },
  propertyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  propertyLogo: { width: 44, height: 44, borderRadius: 22, flexShrink: 0 },
  propertyLogoPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(250,204,21,0.1)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  propertyInfo: { flex: 1 },
  propertyName: { ...typography.h3, color: colors.text.primary },
  propertyAddress: { ...typography.bodySmall, color: colors.text.secondary, marginTop: 2 },
  occupancyBadge: { backgroundColor: 'rgba(250,204,21,0.15)', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6 },
  occupancyText: { ...typography.bodySmall, fontWeight: '600', color: '#facc15' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl * 2 },
  emptyTitle: { ...typography.h3, color: colors.text.primary, marginBottom: spacing.xs, marginTop: spacing.md },
  emptySubtitle: { ...typography.body, color: colors.text.secondary, textAlign: 'center', marginBottom: spacing.lg },
  emptyButton: { marginTop: spacing.md },
  logoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  logoModalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  logoModalTitle: { ...typography.h3, color: colors.text.primary, marginBottom: spacing.xs },
  logoModalOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  logoModalOptionText: { ...typography.body, color: colors.yellow, fontWeight: '600' },
  logoModalCancel: { paddingVertical: spacing.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  logoModalCancelText: { ...typography.body, color: colors.text.secondary, fontWeight: '500' },
  filtersContainer: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.xs },
  filterButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: borderRadius.full, backgroundColor: colors.surfaceLight },
  filterButtonActive: { backgroundColor: '#facc15' },
  filterText: { fontSize: 13, fontWeight: '500', color: colors.text.secondary },
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
  inboxTabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  inboxTabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  inboxTabBtnActive: { borderColor: colors.yellow, backgroundColor: 'rgba(250,204,21,0.1)' },
  inboxTabText: { ...typography.bodySmall, fontWeight: '600', color: colors.text.secondary },
  inboxTabTextActive: { color: colors.yellow },
  seenCount: { backgroundColor: colors.yellow, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  seenCountText: { fontSize: 10, fontWeight: '700', color: colors.background },
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
  profileAvatarSection: { alignItems: 'center', paddingVertical: spacing.lg, marginBottom: spacing.md },
  avatarContainer: { position: 'relative', marginBottom: spacing.sm },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { ...typography.h2, fontWeight: '700', color: colors.background },
  avatarCameraOverlay: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.gray[700], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  avatarName: { ...typography.h3, color: colors.text.primary, marginBottom: 2 },
  avatarEmail: { ...typography.bodySmall, color: colors.text.secondary },
  settingsSection: { marginBottom: spacing.lg },
  settingsSectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginLeft: spacing.xs },
  editLink: { ...typography.bodySmall, fontWeight: '600', color: colors.yellow },
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
  privacySection: { marginTop: spacing.lg, alignItems: 'center' },
  privacyLink: { ...typography.bodySmall, color: colors.text.secondary, textDecorationLine: 'underline' },
  signOutSection: { marginTop: spacing.xl },
  footer: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', marginTop: spacing.sm },
  versionText: { ...typography.caption, color: colors.text.secondary, textAlign: 'center', marginTop: spacing.xxl },
  displayCurrencyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  displayCurrencySelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLight, borderRadius: 8, paddingVertical: 6, paddingHorizontal: spacing.md, gap: 6 },
  displayCurrencySelectorText: { ...typography.bodySmall, color: colors.text.primary, fontWeight: '600' },
  displayCurrencyChevron: { fontSize: 10, color: colors.text.secondary },
  currencyPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  currencyPickerContainer: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: spacing.xl },
  currencyPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  currencyPickerTitle: { ...typography.h3, color: colors.text.primary },
  currencyPickerClose: { ...typography.body, color: colors.text.secondary },
  currencyPickerItem: { padding: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  currencyPickerItemActive: { backgroundColor: 'rgba(250, 204, 21, 0.1)' },
  currencyPickerItemText: { ...typography.body, color: colors.text.primary },
  currencyPickerItemTextActive: { color: '#facc15', fontWeight: '600' },

  // ── Delete Account ──
  deleteAccountSection: { marginTop: spacing.md },
  deleteAccountBtn: {
    borderWidth: 1,
    borderColor: colors.error.main,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteAccountBtnText: { ...typography.button, color: colors.error.main },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  deleteModalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
  },
  deleteModalTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  deleteModalBody: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  manageSubBtn: {
    backgroundColor: colors.yellow,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  manageSubBtnText: { ...typography.button, color: colors.background, textAlign: 'center' },
  continueDeleteBtn: {
    borderWidth: 1,
    borderColor: colors.error.main,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  continueDeleteBtnText: { ...typography.button, color: colors.error.main },
  cancelDeleteBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  cancelDeleteBtnText: { ...typography.body, color: colors.text.secondary },
  proofThumbnail: { width: '100%', height: 160, borderRadius: 8, marginVertical: spacing.sm },
  proofLabel: { ...typography.bodySmall, color: colors.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  proofModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  proofModalClose: { position: 'absolute', top: 56, right: 20, zIndex: 10, padding: spacing.sm },
  proofModalImage: { width: '100%', height: '80%' },
  disconnectReasonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  disconnectReasonLabel: { ...typography.caption, color: colors.text.secondary, flex: 1 },
  disconnectReasonText: { ...typography.bodySmall, color: colors.text.primary, fontStyle: 'italic', marginTop: spacing.xs, marginBottom: spacing.xs },
  disconnectAckBtn: { marginTop: spacing.sm, backgroundColor: colors.error.main, borderColor: colors.error.main },
  whatsappBtn: { marginTop: spacing.sm, borderColor: '#25D366' },
  whatsappBtnText: { color: '#25D366' },
});
