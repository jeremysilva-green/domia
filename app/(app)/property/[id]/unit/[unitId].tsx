import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../src/services/supabase';
import { Card, Button, Input } from '../../../../../src/components/ui';
import { RentIndicator } from '../../../../../src/components/shared';
import { colors, spacing, typography } from '../../../../../src/constants/theme';
import { RentStatus } from '../../../../../src/types';
import { useI18n } from '../../../../../src/i18n';

type Currency = 'USD' | 'PYG';

export default function UnitDetailScreen() {
  const { t } = useI18n();
  const { id: propertyId, unitId } = useLocalSearchParams<{
    id: string;
    unitId: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [editRentAmount, setEditRentAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState<Currency>('USD');
  const [editBedrooms, setEditBedrooms] = useState('');
  const [editBathrooms, setEditBathrooms] = useState('');

  const { data: unit, refetch } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const { data, error } = await supabase
        .from('units')
        .select(
          `
          *,
          property:properties(name, address),
          tenants (
            id,
            full_name,
            email,
            phone,
            status,
            rent_amount,
            lease_start,
            lease_end
          )
        `
        )
        .eq('id', unitId)
        .single();

      if (error) throw error;

      // Get active tenant with rent status
      const activeTenant = data.tenants?.find(
        (tenant: any) => tenant.status === 'active'
      );

      if (activeTenant) {
        const { data: payment } = await supabase
          .from('rent_payments')
          .select('status')
          .eq('tenant_id', activeTenant.id)
          .eq('period_month', currentMonth)
          .eq('period_year', currentYear)
          .single();

        return {
          ...data,
          activeTenant: {
            ...activeTenant,
            current_rent_status: (payment?.status || 'due') as RentStatus,
          },
        };
      }

      return { ...data, activeTenant: null };
    },
    enabled: !!unitId,
    refetchInterval: 10000,
  });

  // Initialize edit form when unit data loads
  useEffect(() => {
    if (unit) {
      setEditUnitNumber(unit.unit_number || '');
      setEditRentAmount(unit.rent_amount?.toString() || '');
      setEditCurrency((unit.currency as Currency) || 'USD');
      setEditBedrooms(unit.bedrooms?.toString() || '1');
      setEditBathrooms(unit.bathrooms?.toString() || '1');
    }
  }, [unit]);

  const updateUnit = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase
        .from('units') as any)
        .update({
          unit_number: editUnitNumber.trim(),
          rent_amount: parseFloat(editRentAmount),
          currency: editCurrency,
          bedrooms: parseInt(editBedrooms) || 1,
          bathrooms: parseFloat(editBathrooms) || 1,
        })
        .eq('id', unitId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unit', unitId] });
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      setIsEditing(false);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const deleteUnit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('units').delete().eq('id', unitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      router.back();
    },
  });

  const handleDelete = () => {
    Alert.alert(
      t.units.deleteUnit,
      t.units.deleteUnitConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => deleteUnit.mutate(),
        },
      ]
    );
  };

  const handleSave = () => {
    if (!editUnitNumber.trim()) {
      Alert.alert(t.common.error, t.units.unitNumberRequired);
      return;
    }
    if (!editRentAmount.trim() || isNaN(parseFloat(editRentAmount))) {
      Alert.alert(t.common.error, t.units.rentAmountRequired);
      return;
    }
    updateUnit.mutate();
  };

  const handleCancelEdit = () => {
    // Reset form to original values
    if (unit) {
      setEditUnitNumber(unit.unit_number || '');
      setEditRentAmount(unit.rent_amount?.toString() || '');
      setEditCurrency((unit.currency as Currency) || 'USD');
      setEditBedrooms(unit.bedrooms?.toString() || '1');
      setEditBathrooms(unit.bathrooms?.toString() || '1');
    }
    setIsEditing(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Get currency symbol for display
  const getCurrencySymbol = (currency?: string) => {
    return currency === 'PYG' ? '₲' : '$';
  };

  if (!unit) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currencySymbol = getCurrencySymbol(unit.currency);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{t.common.back}</Text>
        </TouchableOpacity>
        {isEditing ? (
          <TouchableOpacity onPress={handleCancelEdit}>
            <Text style={styles.cancelButton}>{t.common.cancel}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteButton}>{t.common.delete}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {isEditing ? (
          <>
            <Text style={styles.editTitle}>{t.units.editUnit}</Text>

            <Card style={styles.editCard}>
              <Input
                label={t.units.unitNumber}
                placeholder={t.units.unitNumberPlaceholder}
                value={editUnitNumber}
                onChangeText={setEditUnitNumber}
              />

              <View style={styles.currencyRow}>
                <Text style={styles.currencyLabel}>{t.tenants.currency}</Text>
                <View style={styles.currencyToggle}>
                  <TouchableOpacity
                    style={[
                      styles.currencyButton,
                      editCurrency === 'USD' && styles.currencyButtonActive,
                    ]}
                    onPress={() => setEditCurrency('USD')}
                  >
                    <Text
                      style={[
                        styles.currencyButtonText,
                        editCurrency === 'USD' && styles.currencyButtonTextActive,
                      ]}
                    >
                      $ USD
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.currencyButton,
                      editCurrency === 'PYG' && styles.currencyButtonActive,
                    ]}
                    onPress={() => setEditCurrency('PYG')}
                  >
                    <Text
                      style={[
                        styles.currencyButtonText,
                        editCurrency === 'PYG' && styles.currencyButtonTextActive,
                      ]}
                    >
                      ₲ PYG
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Input
                label={editCurrency === 'USD' ? t.tenants.monthlyRentUSD : t.tenants.monthlyRentPYG}
                placeholder={editCurrency === 'USD' ? '1500' : '5000000'}
                value={editRentAmount}
                onChangeText={setEditRentAmount}
                keyboardType="decimal-pad"
              />

              <Input
                label={t.units.bedrooms}
                placeholder="1"
                value={editBedrooms}
                onChangeText={setEditBedrooms}
                keyboardType="number-pad"
              />

              <Input
                label={t.units.bathrooms}
                placeholder="1"
                value={editBathrooms}
                onChangeText={setEditBathrooms}
                keyboardType="decimal-pad"
              />
            </Card>

            <Button
              title={t.units.saveChanges}
              onPress={handleSave}
              loading={updateUnit.isPending}
              fullWidth
              style={styles.saveButton}
            />
          </>
        ) : (
          <>
            <View style={styles.unitHeader}>
              <Text style={styles.unitNumber}>{unit.unit_number}</Text>
              <Text style={styles.propertyName}>{unit.property?.name}</Text>
              <Text style={styles.propertyAddress}>{unit.property?.address}</Text>
            </View>

            <Card style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.units.monthlyRent}</Text>
                <Text style={styles.detailValue}>
                  {currencySymbol}{unit.rent_amount?.toLocaleString() || '0'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.units.bedrooms}</Text>
                <Text style={styles.detailValue}>{unit.bedrooms || 1}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t.units.bathrooms}</Text>
                <Text style={styles.detailValue}>{unit.bathrooms || 1}</Text>
              </View>
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>{t.units.status}</Text>
                <Text
                  style={[
                    styles.detailValue,
                    { color: (unit as any).activeTenant ? colors.success.main : colors.warning.main },
                  ]}
                >
                  {(unit as any).activeTenant ? t.units.occupied : t.units.vacant}
                </Text>
              </View>
            </Card>

            <Button
              title={t.units.editUnit}
              variant="outline"
              onPress={() => setIsEditing(true)}
              fullWidth
              style={styles.editButton}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t.tenants.title}</Text>

              {unit.activeTenant ? (
                <Card
                  style={styles.tenantCard}
                  onPress={() => router.push(`/(app)/tenant/${unit.activeTenant.id}`)}
                >
                  <View style={styles.tenantHeader}>
                    <Text style={styles.tenantName}>
                      {unit.activeTenant.full_name || t.properties.unnamedTenant}
                    </Text>
                    <RentIndicator status={unit.activeTenant.current_rent_status} />
                  </View>

                  <View style={styles.tenantDetails}>
                    {unit.activeTenant.email && (
                      <Text style={styles.tenantInfo}>{unit.activeTenant.email}</Text>
                    )}
                    {unit.activeTenant.phone && (
                      <Text style={styles.tenantInfo}>{unit.activeTenant.phone}</Text>
                    )}
                  </View>

                  <View style={styles.leaseInfo}>
                    <Text style={styles.leaseLabel}>{t.units.leasePeriod}</Text>
                    <Text style={styles.leaseValue}>
                      {unit.activeTenant.lease_start
                        ? new Date(unit.activeTenant.lease_start).toLocaleDateString()
                        : t.common.notSet}{' '}
                      -{' '}
                      {unit.activeTenant.lease_end
                        ? new Date(unit.activeTenant.lease_end).toLocaleDateString()
                        : t.common.notSet}
                    </Text>
                  </View>

                  <Text style={styles.viewDetails}>{t.units.viewDetails} →</Text>
                </Card>
              ) : (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>{t.units.noTenantAssigned}</Text>
                  <Button
                    title={t.properties.addTenant}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/tenant/new',
                        params: { unitId: unit.id },
                      })
                    }
                    style={styles.addButton}
                  />
                </Card>
              )}
            </View>

            {/* Show all tenants history */}
            {unit.tenants && unit.tenants.length > 1 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t.units.tenantHistory}</Text>
                {unit.tenants
                  .filter((tenant: any) => tenant.status !== 'active')
                  .map((tenant: any) => (
                    <Card
                      key={tenant.id}
                      style={styles.historyCard}
                      onPress={() => router.push(`/(app)/tenant/${tenant.id}`)}
                    >
                      <View style={styles.historyRow}>
                        <Text style={styles.historyName}>{tenant.full_name}</Text>
                        <Text style={styles.historyStatus}>{tenant.status}</Text>
                      </View>
                    </Card>
                  ))}
              </View>
            )}
          </>
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
  cancelButton: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
  },
  deleteButton: {
    ...typography.body,
    color: colors.error.main,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  editTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  editCard: {
    marginBottom: spacing.md,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  currencyLabel: {
    ...typography.body,
    color: colors.text.primary,
    fontWeight: '500',
  },
  currencyToggle: {
    flexDirection: 'row',
    backgroundColor: colors.gray[800],
    borderRadius: 8,
    padding: 2,
  },
  currencyButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
  },
  currencyButtonActive: {
    backgroundColor: '#facc15',
  },
  currencyButtonText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  currencyButtonTextActive: {
    color: colors.black,
  },
  saveButton: {
    marginTop: spacing.md,
  },
  editButton: {
    marginBottom: spacing.lg,
  },
  unitHeader: {
    marginBottom: spacing.lg,
  },
  unitNumber: {
    ...typography.h1,
    color: colors.text.primary,
  },
  propertyName: {
    ...typography.body,
    color: '#facc15',
    marginTop: spacing.xs,
  },
  propertyAddress: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  detailsCard: {
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...typography.body,
    color: colors.text.secondary,
  },
  detailValue: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  tenantCard: {
    padding: spacing.md,
  },
  tenantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  tenantName: {
    ...typography.h3,
    color: colors.text.primary,
  },
  tenantDetails: {
    marginBottom: spacing.sm,
  },
  tenantInfo: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  leaseInfo: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  leaseLabel: {
    ...typography.caption,
    color: colors.text.secondary,
  },
  leaseValue: {
    ...typography.body,
    color: colors.text.primary,
    marginTop: 2,
  },
  viewDetails: {
    ...typography.bodySmall,
    color: '#facc15',
    marginTop: spacing.md,
    textAlign: 'right',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  addButton: {
    marginTop: spacing.sm,
  },
  historyCard: {
    marginBottom: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyName: {
    ...typography.body,
    color: colors.text.primary,
  },
  historyStatus: {
    ...typography.caption,
    color: colors.text.secondary,
    textTransform: 'capitalize',
  },
});
