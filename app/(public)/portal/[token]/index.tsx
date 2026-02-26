import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../../../../src/services/supabase';
import { Card, Button } from '../../../../src/components/ui';
import { StatusBadge } from '../../../../src/components/shared';
import { colors, spacing, typography } from '../../../../src/constants/theme';
import { formatCurrency } from '../../../../src/utils/currency';

export default function TenantPortalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: tenant,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['portal-tenant', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          `
          id,
          full_name,
          email,
          phone,
          rent_amount,
          lease_start,
          lease_end,
          unit:units(
            unit_number,
            currency,
            property:properties(name, address)
          )
        `
        )
        .eq('portal_token', token)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });

  const { data: recentPayments } = useQuery({
    queryKey: ['portal-payments', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rent_payments')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: recentRequests } = useQuery({
    queryKey: ['portal-requests', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tenant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Invalid Link</Text>
          <Text style={styles.errorMessage}>
            This portal link is not valid or has expired.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Domus</Text>
          <Text style={styles.greeting}>Hi, {tenant.full_name || 'Tenant'}</Text>
          {tenant.unit && (
            <Text style={styles.property}>
              {tenant.unit.property?.name}
              {tenant.unit.unit_number && ` - ${tenant.unit.unit_number}`}
            </Text>
          )}
        </View>

        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Monthly Rent</Text>
            <Text style={styles.infoValue}>
              {tenant.rent_amount ? formatCurrency(tenant.rent_amount, tenant.unit?.currency) : 'N/A'}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Lease Ends</Text>
            <Text style={styles.infoValue}>
              {tenant.lease_end
                ? format(new Date(tenant.lease_end), 'MMM d, yyyy')
                : 'N/A'}
            </Text>
          </View>
        </Card>

        <Button
          title="Report Maintenance Issue"
          onPress={() =>
            router.push(`/(public)/portal/${token}/maintenance/new`)
          }
          fullWidth
          style={styles.maintenanceButton}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          {recentPayments && recentPayments.length > 0 ? (
            recentPayments.map((payment: any) => (
              <Card key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                  <View>
                    <Text style={styles.paymentPeriod}>
                      {format(
                        new Date(payment.period_year, payment.period_month - 1),
                        'MMMM yyyy'
                      )}
                    </Text>
                    <Text style={styles.paymentAmount}>
                      {formatCurrency(payment.amount_due, tenant?.unit?.currency)}
                    </Text>
                  </View>
                  <StatusBadge status={payment.status} type="rent" size="sm" />
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No payment history</Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Maintenance Requests</Text>
            <Button
              title="View All"
              variant="ghost"
              size="sm"
              onPress={() =>
                router.push(`/(public)/portal/${token}/maintenance`)
              }
            />
          </View>
          {recentRequests && recentRequests.length > 0 ? (
            recentRequests.map((request: any) => (
              <Card key={request.id} style={styles.requestCard}>
                <View style={styles.requestRow}>
                  <View style={styles.requestInfo}>
                    <Text style={styles.requestTitle}>{request.title}</Text>
                    <Text style={styles.requestDate}>
                      {format(new Date(request.created_at), 'MMM d, yyyy')}
                    </Text>
                  </View>
                  <StatusBadge
                    status={request.status}
                    type="maintenance"
                    size="sm"
                  />
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>No maintenance requests</Text>
            </Card>
          )}
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
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  errorTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  header: {
    marginBottom: spacing.lg,
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary[700],
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  greeting: {
    ...typography.h2,
    color: colors.text.primary,
  },
  property: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  infoCard: {
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  maintenanceButton: {
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  paymentCard: {
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentPeriod: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text.primary,
  },
  paymentAmount: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  requestCard: {
    marginBottom: spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestInfo: {
    flex: 1,
  },
  requestTitle: {
    ...typography.body,
    color: colors.text.primary,
  },
  requestDate: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
