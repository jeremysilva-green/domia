import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../../src/stores/authStore';
import { supabase } from '../../../src/services/supabase';
import { Card, Button } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

export default function TenantHomeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenantProfile, user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  // Get connection request status
  const { data: connectionRequest, refetch } = useQuery({
    queryKey: ['tenant-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('connection_requests')
        .select(`
          *,
          owner:owners(full_name, email, bank_full_name, bank_name, bank_account_number, bank_ruc, bank_alias),
          unit:units(unit_number, property:properties(name, address, image_url))
        `)
        .eq('tenant_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // Get rent payments for rating calculation
  const { data: rentPayments, refetch: refetchPayments } = useQuery({
    queryKey: ['tenant-payments', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('rent_payments')
        .select('id, status, paid_date, due_date')
        .eq('tenant_id', user.id);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id && connectionRequest?.status === 'approved',
  });

  // Calculate tenant score based on payment history
  const tenantScore = useMemo(() => {
    if (!rentPayments || rentPayments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    const paidPayments = rentPayments.filter((p: any) => p.status === 'paid');
    if (paidPayments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    let onTimeCount = 0;
    let lateCount = 0;

    paidPayments.forEach((payment: any) => {
      if (payment.paid_date && payment.due_date) {
        const paidDate = new Date(payment.paid_date);
        const dueDate = new Date(payment.due_date);
        if (paidDate <= dueDate) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      } else {
        onTimeCount++;
      }
    });

    const totalPayments = onTimeCount + lateCount;
    const score = totalPayments > 0 ? onTimeCount / totalPayments : 0.5;

    return { score, onTimeCount, lateCount, totalPayments };
  }, [rentPayments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchPayments()]);
    setRefreshing(false);
  };

  // Subscribe to real-time connection_requests changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`tenant-home-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `tenant_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-connection', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-payments', user.id] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tenants',
          filter: `id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tenant-connection', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !connectionRequest?.id) throw new Error('No connection found');

      // Get unit_id from the connection request; fall back to the tenants table
      let unitId: string | null = connectionRequest.unit_id ?? null;
      if (!unitId) {
        const { data: tenantRecord } = await supabase
          .from('tenants')
          .select('unit_id')
          .eq('id', user.id)
          .single();
        unitId = tenantRecord?.unit_id ?? null;
      }

      // Update unit first (while tenant record still references it for RLS check)
      if (unitId) {
        const { error: unitError } = await supabase
          .from('units')
          .update({ status: 'vacant' })
          .eq('id', unitId);
        if (unitError) throw unitError;
      }

      // Then remove tenant record
      const { error: tenantError } = await supabase
        .from('tenants')
        .delete()
        .eq('id', user.id);
      if (tenantError) throw tenantError;

      // Finally remove the connection request
      const { error: reqError } = await supabase
        .from('connection_requests')
        .delete()
        .eq('id', connectionRequest.id);
      if (reqError) throw reqError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-connection', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['tenant-payments', user?.id] });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to disconnect. Please try again.');
    },
  });

  const handleDisconnect = () => {
    Alert.alert(
      t.tenantHome.disconnectConfirm,
      t.tenantHome.disconnectConfirmMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.tenantHome.disconnectConfirm,
          style: 'destructive',
          onPress: () => disconnectMutation.mutate(),
        },
      ]
    );
  };

  const isConnected = connectionRequest?.status === 'approved';
  const isPending = connectionRequest?.status === 'pending';

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
            onPress={() => router.push('/(tenant)/(tabs)/settings')}
          >
            <Text style={styles.tenantName}>{tenantProfile?.full_name?.split(' ')[0] || ''}</Text>
            {tenantProfile?.profile_image_url ? (
              <Image source={{ uri: tenantProfile.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>
                  {(tenantProfile?.full_name || 'T')
                    .split(' ')
                    .map((n: string) => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {isConnected ? (
          <>
            <Card style={styles.statusCard} padding="none">
              <View style={styles.imageContainer}>
                {(connectionRequest?.unit?.property as any)?.image_url ? (
                  <Image
                    source={{ uri: (connectionRequest?.unit?.property as any).image_url }}
                    style={styles.propertyImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.propertyImagePlaceholder} />
                )}
                <View style={styles.imageOverlay} />
                <View style={styles.overlayContent}>
                  <View style={styles.connectedBadge}>
                    <Feather name="check-circle" size={16} color={colors.success.main} />
                    <Text style={styles.connectedText}>{t.tenantHome.connected}</Text>
                  </View>
                  {connectionRequest?.unit ? (
                    <>
                      <Text style={styles.unitInfo}>
                        {connectionRequest.unit.property?.name}
                        {connectionRequest.unit.unit_number ? ` · ${connectionRequest.unit.unit_number}` : ''}
                      </Text>
                      {connectionRequest.unit.property?.address ? (
                        <Text style={styles.addressInfo}>
                          {connectionRequest.unit.property.address}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.unitPending}>Unit assignment pending</Text>
                  )}
                  <View style={styles.ownerInfo}>
                    <Text style={styles.ownerLabel}>{t.tenantHome.propertyManager}</Text>
                    <Text style={styles.ownerName}>
                      {connectionRequest?.owner?.full_name}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            {tenantScore.totalPayments > 0 && (
              <Card style={styles.scoreCard}>
                <View style={styles.scoreHeader}>
                  <Text style={styles.scoreTitle}>{t.tenantDetail.rating}</Text>
                  <Text style={styles.scoreStats}>
                    {tenantScore.onTimeCount}/{tenantScore.totalPayments} {t.tenantDetail.onTime}
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${tenantScore.score * 100}%` },
                        tenantScore.score >= 0.8 && styles.progressBarHigh,
                        tenantScore.score >= 0.5 && tenantScore.score < 0.8 && styles.progressBarMedium,
                        tenantScore.score < 0.5 && styles.progressBarLow,
                      ]}
                    />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressLabel}>{t.tenantDetail.low}</Text>
                    <Text style={styles.progressLabel}>{t.tenantDetail.high}</Text>
                  </View>
                </View>
              </Card>
            )}

            {(connectionRequest?.owner as any)?.bank_name || (connectionRequest?.owner as any)?.bank_account_number ? (
              <Card style={styles.bankCard}>
                <View style={styles.bankHeader}>
                  <Feather name="credit-card" size={18} color={colors.yellow} />
                  <Text style={styles.bankTitle}>{t.bankInfo.title}</Text>
                </View>
                {(connectionRequest?.owner as any)?.bank_full_name ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.fullName}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_full_name}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_name ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.bankName}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_name}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_account_number ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.accountNumber}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_account_number}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_ruc ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.ruc}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_ruc}</Text>
                  </View>
                ) : null}
                {(connectionRequest?.owner as any)?.bank_alias ? (
                  <View style={styles.bankRow}>
                    <Text style={styles.bankLabel}>{t.bankInfo.alias}</Text>
                    <Text style={styles.bankValue}>{(connectionRequest?.owner as any).bank_alias}</Text>
                  </View>
                ) : null}
              </Card>
            ) : null}

            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>{t.tenantHome.quickActions}</Text>
              <View style={styles.actionsGrid}>
                <Card
                  style={styles.actionCard}
                  onPress={() => router.push('/(tenant)/(tabs)/requests')}
                >
                  <Feather name="tool" size={24} color={colors.yellow} />
                  <Text style={styles.actionTitle}>{t.tenantHome.reportIssue}</Text>
                </Card>
                <Card style={styles.actionCard}>
                  <Feather name="file-text" size={24} color={colors.yellow} />
                  <Text style={styles.actionTitle}>{t.tenantHome.viewLease}</Text>
                </Card>
              </View>
            </View>

            <Button
              title="Disconnect Property"
              variant="outline"
              onPress={handleDisconnect}
              loading={disconnectMutation.isPending}
              fullWidth
              style={styles.disconnectButton}
              textStyle={styles.disconnectText}
            />
          </>
        ) : isPending ? (
          <Card style={styles.pendingCard}>
            <View style={styles.pendingIcon}>
              <Feather name="clock" size={32} color={colors.warning.main} />
            </View>
            <Text style={styles.pendingTitle}>{t.tenantHome.pendingConnection}</Text>
            <Text style={styles.pendingText}>
              {t.tenantHome.pendingConnectionText.replace('{name}', connectionRequest?.owner?.full_name || '')}
            </Text>
          </Card>
        ) : (
          <Card style={styles.welcomeCard}>
            <View style={styles.welcomeIcon}>
              <Feather name="home" size={32} color={colors.yellow} />
            </View>
            <Text style={styles.welcomeTitle}>{t.tenantHome.getStarted}</Text>
            <Text style={styles.welcomeText}>
              {t.tenantHome.connectFeatures}
            </Text>
            <Button
              title={t.tenantHome.findOwner}
              onPress={() => router.push('/(tenant)/(tabs)/owners')}
              fullWidth
              style={styles.welcomeButton}
            />
          </Card>
        )}
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
  tenantName: {
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
    ...typography.caption,
    fontWeight: '700',
    color: colors.background,
  },
  statusCard: {
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  imageContainer: {
    position: 'relative',
    minHeight: 200,
  },
  propertyImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  propertyImagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  overlayContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.success.light,
    borderRadius: 20,
    marginBottom: spacing.sm,
  },
  connectedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success.main,
  },
  unitInfo: {
    ...typography.h2,
    fontWeight: '700',
    color: '#facc15',
    marginTop: spacing.xs,
  },
  unitPending: {
    ...typography.body,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  addressInfo: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.xs,
  },
  ownerInfo: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  ownerLabel: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.6)',
  },
  ownerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.white,
    marginTop: 2,
  },
  scoreCard: {
    marginBottom: spacing.lg,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scoreTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  scoreStats: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  progressBarContainer: {
    marginTop: spacing.xs,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: colors.gray[700],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressBarHigh: {
    backgroundColor: colors.success.main,
  },
  progressBarMedium: {
    backgroundColor: colors.warning.main,
  },
  progressBarLow: {
    backgroundColor: colors.error.main,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  progressLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  bankCard: {
    marginBottom: spacing.lg,
  },
  bankHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  bankTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text.primary,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  bankLabel: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    flex: 1,
  },
  bankValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 2,
    textAlign: 'right',
  },
  actionsSection: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  actionTitle: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.primary,
  },
  pendingCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  pendingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.warning.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pendingTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  pendingText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  welcomeCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  welcomeText: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  welcomeButton: {
    marginTop: spacing.sm,
  },
  disconnectButton: {
    marginTop: spacing.xl,
    borderColor: colors.error.main,
  },
  disconnectText: {
    color: colors.error.main,
  },
});
