import { View, Text, StyleSheet, ScrollView, RefreshControl, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { StatCard } from '../../../src/components/dashboard';
import { Card } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { DashboardStats, ExpiringLease } from '../../../src/types';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DashboardScreen() {
  const router = useRouter();
  const { owner } = useAuthStore();
  const { t, language } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', owner?.id],
    queryFn: async () => {
      if (!owner?.id) throw new Error('No owner');

      // Get current month/year
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      // Fetch all data in parallel
      const [propertiesRes, unitsRes, tenantsRes, paymentsRes, maintenanceRes] =
        await Promise.all([
          supabase.from('properties').select('id').eq('owner_id', owner.id),
          supabase
            .from('units')
            .select('id, status, property_id')
            .in(
              'property_id',
              (
                await supabase
                  .from('properties')
                  .select('id')
                  .eq('owner_id', owner.id)
              ).data?.map((p) => p.id) || []
            ),
          supabase.from('tenants').select('id, rent_amount').eq('owner_id', owner.id).eq('status', 'active'),
          supabase
            .from('rent_payments')
            .select('amount_due, amount_paid, status')
            .eq('period_month', currentMonth)
            .eq('period_year', currentYear)
            .in(
              'tenant_id',
              (
                await supabase
                  .from('tenants')
                  .select('id')
                  .eq('owner_id', owner.id)
              ).data?.map((t) => t.id) || []
            ),
          supabase
            .from('maintenance_requests')
            .select('id, status')
            .in('status', ['submitted', 'in_progress'])
            .in(
              'tenant_id',
              (
                await supabase
                  .from('tenants')
                  .select('id')
                  .eq('owner_id', owner.id)
              ).data?.map((t) => t.id) || []
            ),
        ]);

      const properties = propertiesRes.data || [];
      const units = unitsRes.data || [];
      const tenants = tenantsRes.data || [];
      const payments = paymentsRes.data || [];
      const maintenance = maintenanceRes.data || [];

      const totalRentExpected = tenants.reduce(
        (sum, t) => sum + (t.rent_amount || 0),
        0
      );
      const totalRentCollected = payments.reduce(
        (sum, p) => sum + (p.amount_paid || 0),
        0
      );
      const latePaymentsCount = payments.filter(
        (p) => p.status === 'late'
      ).length;
      const activeMaintenanceCount = maintenance.length;
      const occupiedUnitsCount = units.filter(
        (u) => u.status === 'occupied'
      ).length;

      return {
        totalRentExpected,
        totalRentCollected,
        latePaymentsCount,
        activeMaintenanceCount,
        propertiesCount: properties.length,
        occupiedUnitsCount,
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
        .select(
          `
          id,
          full_name,
          lease_end,
          unit:units(
            unit_number,
            property:properties(name)
          )
        `
        )
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
          const daysUntilExpiry = Math.ceil(
            (leaseEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Image
            source={require('../../../assets/Domia Logo Crop.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.headerRight}
            onPress={() => router.push('/(app)/(tabs)/settings')}
          >
            <Text style={styles.ownerName}>{owner?.full_name || 'Owner'}</Text>
            {owner?.profile_image_url ? (
              <Image source={{ uri: owner.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(owner?.full_name || 'O')
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <StatCard
            title={language === 'es' ? 'Esperado' : 'Expected'}
            value={formatCurrency(stats?.totalRentExpected || 0)}
            subtitle={language === 'es' ? 'Este mes' : 'This month'}
            style={styles.statCard}
          />
          <StatCard
            title={t.home.collected}
            value={formatCurrency(stats?.totalRentCollected || 0)}
            subtitle={language === 'es' ? 'Este mes' : 'This month'}
            variant="success"
            style={styles.statCard}
          />
        </View>

        <View style={styles.statsRow}>
          <StatCard
            title={language === 'es' ? 'Atrasados' : 'Late'}
            value={stats?.latePaymentsCount || 0}
            subtitle={language === 'es' ? 'Pagos' : 'Payments'}
            variant={stats?.latePaymentsCount ? 'error' : 'default'}
            style={styles.statCard}
          />
          <StatCard
            title={language === 'es' ? 'Activas' : 'Active'}
            value={stats?.activeMaintenanceCount || 0}
            subtitle={language === 'es' ? 'Solicitudes' : 'Requests'}
            variant={stats?.activeMaintenanceCount ? 'warning' : 'default'}
            style={styles.statCard}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'es' ? 'Próximos a Vencer' : 'Expiring Soon'}
          </Text>
          {expiringLeases && expiringLeases.length > 0 ? (
            expiringLeases.map((lease) => (
              <Card
                key={lease.tenantId}
                style={styles.leaseCard}
                onPress={() => router.push(`/(app)/tenant/${lease.tenantId}`)}
              >
                <View style={styles.leaseRow}>
                  <View style={styles.leaseInfo}>
                    <Text style={styles.leaseTenant}>{lease.tenantName}</Text>
                    <Text style={styles.leaseProperty}>
                      {lease.propertyName}
                      {lease.unitNumber && ` - ${lease.unitNumber}`}
                    </Text>
                  </View>
                  <View style={styles.leaseDays}>
                    <Text
                      style={[
                        styles.daysCount,
                        lease.daysUntilExpiry <= 7 && styles.daysUrgent,
                      ]}
                    >
                      {lease.daysUntilExpiry}
                    </Text>
                    <Text style={styles.daysLabel}>
                      {language === 'es' ? 'días' : 'days'}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {language === 'es'
                  ? 'No hay contratos por vencer en los próximos 30 días'
                  : 'No leases expiring in the next 30 days'}
              </Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {language === 'es' ? 'Portafolio' : 'Portfolio'}
          </Text>
          <Card style={styles.portfolioCard}>
            <View style={styles.portfolioRow}>
              <Text style={styles.portfolioLabel}>{t.properties.title}</Text>
              <Text style={styles.portfolioValue}>
                {stats?.propertiesCount || 0}
              </Text>
            </View>
            <View style={styles.portfolioRow}>
              <Text style={styles.portfolioLabel}>{t.units.title}</Text>
              <Text style={styles.portfolioValue}>
                {stats?.totalUnitsCount || 0}
              </Text>
            </View>
            <View style={styles.portfolioRow}>
              <Text style={styles.portfolioLabel}>
                {language === 'es' ? 'Ocupación' : 'Occupancy'}
              </Text>
              <Text style={styles.portfolioValue}>
                {stats?.totalUnitsCount
                  ? Math.round(
                      ((stats?.occupiedUnitsCount || 0) /
                        stats.totalUnitsCount) *
                        100
                    )
                  : 0}
                %
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    height: 50,
    width: 150,
    marginLeft: -8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#facc15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.background,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  leaseCard: {
    marginBottom: spacing.sm,
  },
  leaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leaseInfo: {
    flex: 1,
  },
  leaseTenant: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  leaseProperty: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  leaseDays: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    minWidth: 60,
  },
  daysCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#facc15',
  },
  daysUrgent: {
    color: colors.error.main,
  },
  daysLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  portfolioCard: {
    gap: spacing.sm,
  },
  portfolioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portfolioLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  portfolioValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
});
