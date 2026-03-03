import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../../../../src/services/supabase';
import { Card, Button, Badge } from '../../../../src/components/ui';
import { StatusBadge } from '../../../../src/components/shared';
import { colors, spacing, typography } from '../../../../src/constants/theme';
import { TenantWithDetails, RentPayment } from '../../../../src/types';
import { useI18n } from '../../../../src/i18n';
import { formatCurrency } from '../../../../src/utils/currency';

export default function TenantDetailScreen() {
  const { t, language } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Get current month/year for payment tracking
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [leaseModalVisible, setLeaseModalVisible] = useState(false);

  const { data: tenant, refetch } = useQuery<TenantWithDetails>({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          `
          *,
          unit:units(
            unit_number,
            rent_amount,
            currency,
            property:properties(name, address)
          ),
          rent_payments(
            id,
            period_month,
            period_year,
            amount_due,
            amount_paid,
            due_date,
            paid_date,
            status
          ),
          maintenance_requests(
            id,
            title,
            status,
            actual_cost,
            created_at
          )
        `
        )
        .eq('id', id)
        .order('period_year', { foreignTable: 'rent_payments', ascending: false })
        .order('period_month', { foreignTable: 'rent_payments', ascending: false })
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const markAsPaid = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('rent_payments')
        .update({
          status: 'paid',
          amount_paid: tenant?.rent_amount,
          paid_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', paymentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  // Create and mark current month payment as paid
  const markCurrentMonthPaid = useMutation({
    mutationFn: async () => {
      if (!tenant) throw new Error('No tenant');

      // Check if payment for current month exists
      const { data: existingPayment } = await supabase
        .from('rent_payments')
        .select('id')
        .eq('tenant_id', id)
        .eq('period_month', currentMonth)
        .eq('period_year', currentYear)
        .single();

      if (existingPayment) {
        // Update existing payment
        const { error } = await supabase
          .from('rent_payments')
          .update({
            status: 'paid',
            amount_paid: tenant.rent_amount,
            paid_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', existingPayment.id);

        if (error) throw error;
      } else {
        // Create new payment record
        const dueDate = new Date(currentYear, currentMonth - 1, 5); // Due on 5th of month
        const { error } = await supabase
          .from('rent_payments')
          .insert({
            tenant_id: id,
            period_month: currentMonth,
            period_year: currentYear,
            amount_due: tenant.rent_amount,
            amount_paid: tenant.rent_amount,
            due_date: dueDate.toISOString().split('T')[0],
            paid_date: new Date().toISOString().split('T')[0],
            status: 'paid',
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['property'] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  // Check if current month is paid
  const currentMonthPaid = useMemo(() => {
    if (!tenant?.rent_payments) return false;
    return tenant.rent_payments.some(
      (p: RentPayment) =>
        p.period_month === currentMonth &&
        p.period_year === currentYear &&
        p.status === 'paid'
    );
  }, [tenant?.rent_payments, currentMonth, currentYear]);

  // Calculate tenant score based on payment history
  const tenantScore = useMemo(() => {
    if (!tenant?.rent_payments || tenant.rent_payments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    const payments = tenant.rent_payments.filter((p: RentPayment) => p.status === 'paid');
    if (payments.length === 0) {
      return { score: 0.5, onTimeCount: 0, lateCount: 0, totalPayments: 0 };
    }

    let onTimeCount = 0;
    let lateCount = 0;

    payments.forEach((payment: RentPayment) => {
      if (payment.paid_date && payment.due_date) {
        const paidDate = new Date(payment.paid_date);
        const dueDate = new Date(payment.due_date);
        if (paidDate <= dueDate) {
          onTimeCount++;
        } else {
          lateCount++;
        }
      } else {
        // If no due date, assume on time
        onTimeCount++;
      }
    });

    const totalPayments = onTimeCount + lateCount;
    const score = totalPayments > 0 ? onTimeCount / totalPayments : 0.5;

    return { score, onTimeCount, lateCount, totalPayments };
  }, [tenant?.rent_payments]);

  const deleteTenant = useMutation({
    mutationFn: async () => {
      // Update unit status to vacant if tenant was linked to a unit
      if (tenant?.unit_id) {
        await (supabase.from('units') as any)
          .update({ status: 'vacant' })
          .eq('id', tenant.unit_id);
      }

      const { error } = await supabase.from('tenants').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['property'] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to delete tenant');
    },
  });

  const handleDelete = () => {
    Alert.alert(
      t.tenantDetail.deleteTenant,
      `${t.tenantDetail.deleteTenantConfirm} ${tenant?.full_name || t.properties.unnamedTenant}?`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => deleteTenant.mutate(),
        },
      ]
    );
  };

  const uploadLease = useMutation({
    mutationFn: async (imageUri: string) => {
      const fileName = `lease-${id}-${Date.now()}.jpg`;

      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      const { error: uploadError } = await supabase.storage
        .from('property-images')
        .upload(fileName, decode(base64), {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('property-images')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('tenants')
        .update({ lease_image_url: urlData.publicUrl } as any)
        .eq('id', id as string);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const handlePickLeaseImage = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(t.properties.permissionRequired, t.properties.permissionMessage);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.85,
    });

    if (!result.canceled && result.assets[0]) {
      uploadLease.mutate(result.assets[0].uri);
    }
  };

  const handleCall = () => {
    if (tenant?.phone) {
      Linking.openURL(`tel:${tenant.phone}`);
    }
  };

  const handleWhatsApp = () => {
    if (tenant?.phone) {
      const cleanPhone = tenant.phone.replace(/\D/g, '');
      Linking.openURL(`whatsapp://send?phone=${cleanPhone}`);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!tenant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const recentPayments = (tenant.rent_payments || []).slice(0, 6);
  const recentMaintenance = (tenant.maintenance_requests || []).slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{t.common.back}</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push(`/(app)/tenant/${id}/edit`)}>
            <Text style={styles.editButton}>{t.common.edit}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Feather name="trash-2" size={20} color={colors.error.main} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.tenantHeader}>
          <View style={styles.tenantNameRow}>
            <Text style={styles.tenantName}>
              {tenant.full_name || t.properties.unnamedTenant}
            </Text>
            <TouchableOpacity
              style={[
                styles.paidButton,
                currentMonthPaid && styles.paidButtonActive,
              ]}
              onPress={() => !currentMonthPaid && markCurrentMonthPaid.mutate()}
              disabled={currentMonthPaid || markCurrentMonthPaid.isPending}
            >
              <Feather
                name="check-circle"
                size={16}
                color={currentMonthPaid ? colors.white : colors.success.main}
              />
              <Text
                style={[
                  styles.paidButtonText,
                  currentMonthPaid && styles.paidButtonTextActive,
                ]}
              >
                {currentMonthPaid ? t.tenantDetail.paid : t.tenantDetail.markPaid}
              </Text>
            </TouchableOpacity>
          </View>
          {tenant.unit && (
            <Text style={styles.propertyInfo}>
              {tenant.unit.property?.name} - {tenant.unit.unit_number}
            </Text>
          )}
          <Badge
            label={
              tenant.status === 'active'
                ? t.tenants.active
                : tenant.status === 'pending'
                ? t.tenants.pending
                : t.tenants.inactive
            }
            variant={
              tenant.status === 'active'
                ? 'success'
                : tenant.status === 'pending'
                ? 'warning'
                : 'neutral'
            }
            style={styles.statusBadge}
          />
        </View>

        <Card style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t.tenantDetail.rent}</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(tenant.rent_amount, tenant.unit?.currency)}/{t.tenantDetail.month}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t.tenants.leaseStart}</Text>
            <Text style={styles.infoValue}>
              {tenant.lease_start
                ? format(new Date(tenant.lease_start), language === 'es' ? 'dd/MM/yyyy' : 'MMM d, yyyy')
                : t.common.notSet}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t.tenants.leaseEnd}</Text>
            <Text style={styles.infoValue}>
              {tenant.lease_end
                ? format(new Date(tenant.lease_end), language === 'es' ? 'dd/MM/yyyy' : 'MMM d, yyyy')
                : t.common.notSet}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t.tenants.email}</Text>
            <Text style={styles.infoValue}>
              {tenant.email || t.common.notSet}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t.tenants.phone}</Text>
            <Text style={styles.infoValue}>
              {tenant.phone || t.common.notSet}
            </Text>
          </View>
          {(tenant as any).ruc ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.tenants.ruc}</Text>
                <Text style={styles.infoValue}>{(tenant as any).ruc}</Text>
              </View>
            </>
          ) : null}
          {(tenant as any).razon_social ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t.tenants.razonSocial}</Text>
                <Text style={styles.infoValue}>{(tenant as any).razon_social}</Text>
              </View>
            </>
          ) : null}
        </Card>

        <View style={styles.actionsRow}>
          <Button
            title={t.tenantDetail.call}
            variant="outline"
            onPress={handleCall}
            disabled={!tenant.phone}
            style={styles.actionButton}
          />
          <Button
            title="WhatsApp"
            variant="outline"
            onPress={handleWhatsApp}
            disabled={!tenant.phone}
            style={styles.actionButton}
          />
        </View>

        {/* Lease Document Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.tenantDetail.leaseDocument}</Text>
          <Card padding="none" style={styles.leaseCard}>
            {(tenant as any).lease_image_url ? (
              <>
                <TouchableOpacity onPress={() => setLeaseModalVisible(true)}>
                  <Image
                    source={{ uri: (tenant as any).lease_image_url }}
                    style={styles.leaseThumbnail}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.leaseUploadButton}
                  onPress={handlePickLeaseImage}
                  disabled={uploadLease.isPending}
                >
                  {uploadLease.isPending ? (
                    <ActivityIndicator size="small" color={colors.yellow} />
                  ) : (
                    <>
                      <Feather name="upload" size={14} color={colors.yellow} />
                      <Text style={styles.leaseUploadText}>{t.tenantDetail.changeLeaseImage}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.leaseEmptyState}
                onPress={handlePickLeaseImage}
                disabled={uploadLease.isPending}
              >
                {uploadLease.isPending ? (
                  <ActivityIndicator size="small" color={colors.yellow} />
                ) : (
                  <>
                    <Feather name="upload" size={32} color={colors.text.secondary} />
                    <Text style={styles.leaseEmptyText}>{t.tenantDetail.noLeaseUploaded}</Text>
                    <Text style={styles.leaseUploadText}>{t.tenantDetail.uploadLease}</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </Card>
        </View>

        {/* Lease Image Modal */}
        <Modal
          visible={leaseModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLeaseModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setLeaseModalVisible(false)}
            >
              <Feather name="x" size={24} color={colors.white} />
            </TouchableOpacity>
            {(tenant as any).lease_image_url && (
              <Image
                source={{ uri: (tenant as any).lease_image_url }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.tenantDetail.rentHistory}</Text>

          {/* Tenant Score */}
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
                  <Text style={styles.progressLabelLow}>{t.tenantDetail.low}</Text>
                  <Text style={styles.progressLabelHigh}>{t.tenantDetail.high}</Text>
                </View>
              </View>
            </Card>
          )}

          {recentPayments.length > 0 ? (
            recentPayments.map((payment: RentPayment) => (
              <Card key={payment.id} style={styles.paymentCard}>
                <View style={styles.paymentRow}>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentPeriod}>
                      {format(
                        new Date(payment.period_year, payment.period_month - 1),
                        language === 'es' ? 'MMMM yyyy' : 'MMMM yyyy'
                      )}
                    </Text>
                    <Text style={styles.paymentAmount}>
                      {formatCurrency(payment.amount_paid || payment.amount_due, tenant?.unit?.currency)}
                    </Text>
                    {payment.status === 'paid' && payment.paid_date && (
                      <Text style={styles.paidDate}>
                        {t.tenantDetail.paidOn} {format(new Date(payment.paid_date), language === 'es' ? 'dd/MM/yyyy' : 'MMM d, yyyy')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.paymentActions}>
                    <StatusBadge status={payment.status} type="rent" size="sm" />
                    {(payment.status === 'due' || payment.status === 'late') && (
                      <TouchableOpacity
                        style={styles.markPaidButton}
                        onPress={() => markAsPaid.mutate(payment.id)}
                      >
                        <Text style={styles.markPaidText}>{t.tenantDetail.markPaid}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t.tenantDetail.noPaymentHistory}</Text>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t.tenantDetail.maintenanceHistory}</Text>
          {recentMaintenance.length > 0 ? (
            recentMaintenance.map((request: any) => (
              <Card
                key={request.id}
                style={styles.maintenanceCard}
                onPress={() => router.push(`/(app)/maintenance/${request.id}`)}
              >
                <View style={styles.maintenanceRow}>
                  <View style={styles.maintenanceInfo}>
                    <Text style={styles.maintenanceTitle}>{request.title}</Text>
                    <Text style={styles.maintenanceDate}>
                      {format(new Date(request.created_at), language === 'es' ? 'dd/MM/yyyy' : 'MMM d, yyyy')}
                    </Text>
                  </View>
                  <View style={styles.maintenanceActions}>
                    <StatusBadge
                      status={request.status}
                      type="maintenance"
                      size="sm"
                    />
                    {request.actual_cost && (
                      <Text style={styles.maintenanceCost}>
                        {formatCurrency(request.actual_cost, tenant?.unit?.currency)}
                      </Text>
                    )}
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t.tenantDetail.noMaintenanceRequests}</Text>
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editButton: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.xxl,
  },
  tenantHeader: {
    marginBottom: spacing.lg,
  },
  tenantNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tenantName: {
    ...typography.h1,
    color: colors.text.primary,
    flex: 1,
  },
  paidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.success.main,
  },
  paidButtonActive: {
    backgroundColor: colors.success.main,
    borderColor: colors.success.main,
  },
  paidButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.success.main,
  },
  paidButtonTextActive: {
    color: colors.white,
  },
  propertyInfo: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  statusBadge: {
    marginTop: spacing.sm,
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
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  scoreCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
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
  progressLabelLow: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  progressLabelHigh: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  paymentCard: {
    marginBottom: spacing.sm,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentInfo: {},
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
  paidDate: {
    ...typography.caption,
    color: colors.success.main,
    marginTop: 2,
  },
  paymentActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  markPaidButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  markPaidText: {
    ...typography.caption,
    color: '#facc15',
    fontWeight: '600',
  },
  maintenanceCard: {
    marginBottom: spacing.sm,
  },
  maintenanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  maintenanceInfo: {
    flex: 1,
  },
  maintenanceTitle: {
    ...typography.body,
    color: colors.text.primary,
  },
  maintenanceDate: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  maintenanceActions: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  maintenanceCost: {
    ...typography.bodySmall,
    fontWeight: '600',
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
  leaseCard: {
    overflow: 'hidden',
  },
  leaseThumbnail: {
    width: '100%',
    height: 200,
  },
  leaseUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  leaseUploadText: {
    ...typography.bodySmall,
    color: colors.yellow,
    fontWeight: '600',
  },
  leaseEmptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  leaseEmptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: spacing.sm,
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
});
