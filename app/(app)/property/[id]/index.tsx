import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ImageBackground,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/services/supabase';
import { Card, Button, Badge, Input } from '../../../../src/components/ui';
import { RentIndicator } from '../../../../src/components/shared';
import { colors, spacing, typography, borderRadius } from '../../../../src/constants/theme';
import { PropertyWithUnits, RentStatus } from '../../../../src/types';
import { useI18n } from '../../../../src/i18n';
import { formatMonthlyRent } from '../../../../src/utils/currency';
import { useAuthStore } from '../../../../src/stores/authStore';
import {
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  PLAN_PRODUCT_IDS,
  PlanType,
  useSubscriptionStore,
} from '../../../../src/stores/subscriptionStore';

const PLAN_ORDER: PlanType[] = ['1-10', '10-30', '30-50'];

export default function PropertyDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedUpgradePlan, setSelectedUpgradePlan] = useState<PlanType | null>(null);
  const [isCheckingLimit, setIsCheckingLimit] = useState(false);
  const [isEditingProperty, setIsEditingProperty] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [menuUnit, setMenuUnit] = useState<any>(null);
  const [showUnitMenu, setShowUnitMenu] = useState(false);

  const owner = useAuthStore((state) => state.owner);
  const { upgradePlan } = useAuthStore();
  const { purchasePlan, isPurchasing, initConnection } = useSubscriptionStore();

  const currentPlan = (owner as any)?.plan_type as PlanType | null;
  const upgradePlans = currentPlan
    ? PLAN_ORDER.slice(PLAN_ORDER.indexOf(currentPlan) + 1)
    : PLAN_ORDER.slice(1);

  const handleAddUnit = async () => {
    if (!owner) return;
    setIsCheckingLimit(true);
    try {
      const { count } = await supabase
        .from('units')
        .select('id, properties!inner(owner_id)', { count: 'exact', head: true })
        .eq('properties.owner_id', owner.id);

      const limit = currentPlan ? PLAN_LIMITS[currentPlan] : 10;
      if (count !== null && count >= limit) {
        setSelectedUpgradePlan(null);
        initConnection();
        setShowUpgradeModal(true);
        return;
      }
    } finally {
      setIsCheckingLimit(false);
    }
    router.push(`/(app)/property/${id}/unit/new`);
  };

  const handleUpgrade = async () => {
    if (!selectedUpgradePlan) return;

    if (__DEV__) {
      try {
        await upgradePlan(selectedUpgradePlan, PLAN_PRODUCT_IDS[selectedUpgradePlan]);
        setShowUpgradeModal(false);
        router.push(`/(app)/property/${id}/unit/new`);
      } catch (e: any) {
        Alert.alert(t.common.error, e.message);
      }
      return;
    }

    purchasePlan(
      selectedUpgradePlan,
      async () => {
        try {
          await upgradePlan(selectedUpgradePlan, PLAN_PRODUCT_IDS[selectedUpgradePlan]);
          setShowUpgradeModal(false);
          router.push(`/(app)/property/${id}/unit/new`);
        } catch (e: any) {
          Alert.alert(t.common.error, e.message);
        }
      },
      (msg) => Alert.alert(t.settings.upgradeFailed, msg)
    );
  };

  const { data: property, refetch } = useQuery<PropertyWithUnits>({
    queryKey: ['property', id],
    queryFn: async () => {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const { data, error } = await supabase
        .from('properties')
        .select(
          `
          *,
          units (
            *,
            tenants (
              id,
              full_name,
              status,
              rent_amount,
              lease_end
            )
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      // Calculate rent status for each unit's tenant
      const unitsWithStatus = await Promise.all(
        data.units.map(async (unit: any) => {
          const activeTenant = unit.tenants?.find(
            (tenant: any) => tenant.status === 'active'
          );

          if (!activeTenant) {
            return { ...unit, tenant: null };
          }

          const { data: payment } = await supabase
            .from('rent_payments')
            .select('status')
            .eq('tenant_id', activeTenant.id)
            .eq('period_month', currentMonth)
            .eq('period_year', currentYear)
            .single();

          return {
            ...unit,
            tenant: {
              ...activeTenant,
              current_rent_status: (payment?.status || 'due') as RentStatus,
            },
          };
        })
      );

      return { ...data, units: unitsWithStatus };
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (property) {
      setEditName((property as any).name || '');
      setEditAddress((property as any).address || '');
      setEditCity((property as any).city || '');
    }
  }, [property]);

  const updateProperty = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from('properties') as any)
        .update({ name: editName.trim(), address: editAddress.trim(), city: editCity.trim() || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      setIsEditingProperty(false);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const duplicateUnit = useMutation({
    mutationFn: async (unit: any) => {
      const { error } = await (supabase.from('units') as any).insert({
        property_id: id,
        unit_number: `${unit.unit_number} (copy)`,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        rent_amount: unit.rent_amount,
        currency: unit.currency,
        status: 'vacant',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const deleteUnitDirect = useMutation({
    mutationFn: async (unitId: string) => {
      const { error } = await supabase.from('units').delete().eq('id', unitId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const deleteProperty = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      router.back();
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (imageUri: string) => {
      const fileName = `property-${id}-${Date.now()}.jpg`;

      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64',
      });

      // Upload using base64 decoded to arraybuffer
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

      const { error: updateError } = await (supabase
        .from('properties') as any)
        .update({ image_url: urlData.publicUrl })
        .eq('id', id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property', id] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.properties.uploadFailed);
    },
  });

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(t.properties.permissionRequired, t.properties.permissionMessage);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage.mutate(result.assets[0].uri);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t.properties.deleteProperty,
      t.properties.deletePropertyConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => deleteProperty.mutate(),
        },
      ]
    );
  };

  // Real-time: refresh when a connection request for this property changes
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`property-detail-rt-${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connection_requests', filter: `property_id=eq.${id}` },
        () => { queryClient.invalidateQueries({ queryKey: ['property', id] }); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, queryClient]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!property) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const occupiedCount = property.units.filter(
    (u: any) => u.tenant !== null
  ).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>{t.common.back}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteButton}>{t.common.delete}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {property.image_url ? (
          <ImageBackground
            source={{ uri: property.image_url }}
            style={styles.propertyHeaderImage}
            imageStyle={styles.propertyImage}
          >
            <View style={styles.imageOverlay}>
              <View style={styles.propertyNameRow}>
                <Text style={styles.propertyNameLight}>{property.name}</Text>
                <TouchableOpacity onPress={() => setIsEditingProperty(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="edit-2" size={16} color="#facc15" />
                </TouchableOpacity>
              </View>
              {(property as any).property_type === 'house' && (
                <Badge
                  label={occupiedCount > 0 ? t.units.occupied : t.units.vacant}
                  variant={occupiedCount > 0 ? 'success' : 'warning'}
                  size="sm"
                  style={styles.houseBadge}
                />
              )}
              <Text style={styles.propertyAddressLight}>{property.address}</Text>
              {property.city && (
                <Text style={styles.propertyCityLight}>{property.city}</Text>
              )}
              <TouchableOpacity
                style={styles.changeImageButton}
                onPress={handlePickImage}
                disabled={uploadImage.isPending}
              >
                <Feather name="camera" size={16} color={colors.white} />
                <Text style={styles.changeImageText}>
                  {uploadImage.isPending ? t.properties.uploading : t.properties.change}
                </Text>
              </TouchableOpacity>
            </View>
          </ImageBackground>
        ) : (
          <View style={styles.propertyHeader}>
            <View style={styles.propertyNameRow}>
              <Text style={styles.propertyName}>{property.name}</Text>
              <TouchableOpacity onPress={() => setIsEditingProperty(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="edit-2" size={16} color="#facc15" />
              </TouchableOpacity>
            </View>
            {(property as any).property_type === 'house' && (
              <Badge
                label={occupiedCount > 0 ? t.units.occupied : t.units.vacant}
                variant={occupiedCount > 0 ? 'success' : 'warning'}
                size="sm"
                style={styles.houseBadge}
              />
            )}
            <Text style={styles.propertyAddress}>{property.address}</Text>
            {property.city && (
              <Text style={styles.propertyCity}>{property.city}</Text>
            )}
            <TouchableOpacity
              style={styles.addImageButton}
              onPress={handlePickImage}
              disabled={uploadImage.isPending}
            >
              <Feather name="camera" size={18} color={colors.yellow} />
              <Text style={styles.addImageText}>
                {uploadImage.isPending ? t.properties.uploading : t.properties.addPhoto}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(property as any).property_type !== 'house' && (
          <>
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{property.units.length}</Text>
                <Text style={styles.statLabel}>{t.units.title}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>{occupiedCount}</Text>
                <Text style={styles.statLabel}>{t.units.occupied}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Text style={styles.statValue}>
                  {property.units.length - occupiedCount}
                </Text>
                <Text style={styles.statLabel}>{t.units.vacant}</Text>
              </Card>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t.units.title}</Text>
                <TouchableOpacity onPress={handleAddUnit} disabled={isCheckingLimit}>
                  {isCheckingLimit
                    ? <ActivityIndicator size="small" color={colors.yellow} />
                    : <Text style={styles.addLink}>+ {t.units.addUnit}</Text>
                  }
                </TouchableOpacity>
              </View>

              {property.units.length > 0 ? (
                property.units.map((unit) => (
                  <TouchableOpacity
                    key={unit.id}
                    activeOpacity={0.7}
                    delayLongPress={400}
                    onPress={() => router.push(`/(app)/property/${id}/unit/${unit.id}`)}
                    onLongPress={() => { setMenuUnit(unit); setShowUnitMenu(true); }}
                  >
                  <Card
                    style={styles.unitCard}
                  >
                    <View style={styles.unitHeader}>
                      <View style={styles.unitTitleRow}>
                        <Text style={styles.unitNumber}>{unit.unit_number}</Text>
                        <Badge
                          label={(unit as any).tenant ? t.units.occupied : t.units.vacant}
                          variant={(unit as any).tenant ? 'success' : 'warning'}
                          size="sm"
                        />
                      </View>
                      <Text style={styles.unitRent}>
                        {formatMonthlyRent(unit.rent_amount, unit.currency)}
                      </Text>
                    </View>

                    {unit.tenant ? (
                      <View style={styles.tenantRow}>
                        <View style={styles.tenantInfo}>
                          <Text style={styles.tenantName}>
                            {unit.tenant.full_name || t.properties.unnamedTenant}
                          </Text>
                          <Text style={styles.tenantLease}>
                            {t.properties.leaseEnds}{' '}
                            {unit.tenant.lease_end
                              ? new Date(unit.tenant.lease_end).toLocaleDateString()
                              : t.common.notSet}
                          </Text>
                        </View>
                        <RentIndicator
                          status={unit.tenant.current_rent_status || 'due'}
                        />
                      </View>
                    ) : (
                      <View style={styles.vacantRow}>
                        <Text style={styles.vacantText}>{t.units.vacant}</Text>
                        <Text style={styles.tapToEdit}>{t.units.tapToEdit}</Text>
                      </View>
                    )}
                  </Card>
                  </TouchableOpacity>
                ))
              ) : (
                <Card style={styles.emptyCard}>
                  <Text style={styles.emptyText}>{t.units.noUnitsYet}</Text>
                  <Button
                    title={t.units.addFirstUnit}
                    onPress={handleAddUnit}
                    loading={isCheckingLimit}
                    style={styles.emptyButton}
                  />
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Upgrade Plan Modal */}
      <Modal
        visible={showUpgradeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUpgradeModal(false)}
        >
          <View style={styles.upgradeModal}>
            <View style={styles.upgradeModalHeader}>
              <Text style={styles.upgradeModalTitle}>{t.settings.upgradePlanTitle}</Text>
              <TouchableOpacity onPress={() => setShowUpgradeModal(false)}>
                <Feather name="x" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.upgradeModalBody}>
              {(t.settings.upgradePlanBody as any)(
                PLAN_LIMITS[currentPlan ?? '1-10'],
                PLAN_NAMES[currentPlan ?? '1-10']
              )}
            </Text>

            <Text style={styles.upgradeChooseLabel}>{t.settings.upgradeChoosePlan}</Text>

            <View style={styles.upgradePlanList}>
              {upgradePlans.map((plan) => (
                <TouchableOpacity
                  key={plan}
                  style={[styles.upgradePlanPill, selectedUpgradePlan === plan && styles.upgradePlanPillSelected]}
                  onPress={() => setSelectedUpgradePlan(plan)}
                  activeOpacity={0.8}
                >
                  <View>
                    <Text style={[styles.upgradePlanName, selectedUpgradePlan === plan && styles.upgradePlanNameSelected]}>
                      {PLAN_NAMES[plan]}
                    </Text>
                    <Text style={[styles.upgradePlanSub, selectedUpgradePlan === plan && styles.upgradePlanSubSelected]}>
                      {plan === '30-50' ? '∞ units' : `Up to ${PLAN_LIMITS[plan]} units`}
                    </Text>
                  </View>
                  <Text style={[styles.upgradePlanPrice, selectedUpgradePlan === plan && styles.upgradePlanNameSelected]}>
                    {PLAN_PRICES[plan]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.upgradeCtaBtn, (!selectedUpgradePlan || isPurchasing) && styles.upgradeCtaBtnDisabled]}
              onPress={handleUpgrade}
              disabled={!selectedUpgradePlan || isPurchasing}
              activeOpacity={0.85}
            >
              <Text style={styles.upgradeCtaText}>
                {isPurchasing ? '...' : t.settings.upgradeButton}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Unit Context Menu */}
      <Modal visible={showUnitMenu} transparent animationType="fade" onRequestClose={() => setShowUnitMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowUnitMenu(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuUnitTitle}>{menuUnit?.unit_number}</Text>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowUnitMenu(false);
                if (menuUnit) duplicateUnit.mutate(menuUnit);
              }}
            >
              <Feather name="copy" size={18} color={colors.yellow} />
              <Text style={styles.menuItemText}>{t.units.duplicate}</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowUnitMenu(false);
                if (menuUnit) {
                  Alert.alert(
                    t.units.deleteUnit,
                    t.units.deleteUnitConfirm,
                    [
                      { text: t.common.cancel, style: 'cancel' },
                      { text: t.common.delete, style: 'destructive', onPress: () => deleteUnitDirect.mutate(menuUnit.id) },
                    ]
                  );
                }
              }}
            >
              <Feather name="trash-2" size={18} color={colors.error.main} />
              <Text style={[styles.menuItemText, { color: colors.error.main }]}>{t.common.delete}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit Property Modal */}
      <Modal
        visible={isEditingProperty}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditingProperty(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity
            style={styles.editModalOverlay}
            activeOpacity={1}
            onPress={() => setIsEditingProperty(false)}
          >
          <View style={styles.editModalContainer}>
            <View style={styles.editModalHeader}>
              <Text style={styles.editModalTitle}>{t.properties.newProperty}</Text>
              <TouchableOpacity onPress={() => setIsEditingProperty(false)}>
                <Text style={styles.editModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Input label={t.properties.propertyName} value={editName} onChangeText={setEditName} />
            <Input label={t.properties.address} value={editAddress} onChangeText={setEditAddress} />
            <Input label={t.properties.city} value={editCity} onChangeText={setEditCity} />
            <Button
              title={t.common.save}
              onPress={() => {
                if (!editName.trim()) { Alert.alert(t.common.error, t.properties.propertyNameRequired); return; }
                if (!editAddress.trim()) { Alert.alert(t.common.error, t.properties.addressRequired); return; }
                updateProperty.mutate();
              }}
              loading={updateProperty.isPending}
              fullWidth
              style={styles.editModalSaveBtn}
            />
          </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
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
  propertyHeader: {
    marginBottom: spacing.lg,
  },
  propertyHeaderImage: {
    height: 180,
    marginBottom: spacing.lg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  propertyImage: {
    borderRadius: 16,
  },
  imageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  propertyName: {
    ...typography.h1,
    color: colors.text.primary,
  },
  propertyNameLight: {
    ...typography.h1,
    color: colors.white,
  },
  propertyAddress: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  propertyAddressLight: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: spacing.xs,
  },
  propertyCity: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  propertyCityLight: {
    ...typography.bodySmall,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  addImageText: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
  },
  changeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  changeImageText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#facc15',
  },
  statLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
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
  addLink: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
  },
  unitCard: {
    marginBottom: spacing.sm,
  },
  unitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  unitTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  unitNumber: {
    ...typography.h3,
    color: colors.text.primary,
  },
  unitRent: {
    ...typography.body,
    fontWeight: '600',
    color: '#facc15',
  },
  tenantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tenantInfo: {
    flex: 1,
  },
  tenantName: {
    ...typography.body,
    color: colors.text.primary,
  },
  tenantLease: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  vacantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  vacantText: {
    ...typography.body,
    color: colors.gray[500],
    fontStyle: 'italic',
  },
  tapToEdit: {
    ...typography.caption,
    color: '#facc15',
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
  emptyButton: {
    marginTop: spacing.sm,
  },
  houseBadge: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },

  // ── Upgrade modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  upgradeModal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  upgradeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upgradeModalTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  upgradeModalBody: {
    ...typography.body,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  upgradeChooseLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  upgradePlanList: {
    gap: spacing.sm,
  },
  upgradePlanPill: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  upgradePlanPillSelected: {
    borderColor: colors.yellow,
    backgroundColor: 'rgba(250,204,21,0.08)',
  },
  upgradePlanName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text.primary,
  },
  upgradePlanNameSelected: {
    color: colors.yellow,
  },
  upgradePlanSub: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  upgradePlanSubSelected: {
    color: 'rgba(250,204,21,0.7)',
  },
  upgradePlanPrice: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  upgradeCtaBtn: {
    backgroundColor: colors.yellow,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  upgradeCtaBtnDisabled: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  upgradeCtaText: {
    ...typography.button,
    color: colors.background,
  },
  propertyNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  editModalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  editModalTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  editModalClose: {
    ...typography.body,
    color: colors.text.secondary,
  },
  editModalSaveBtn: {
    marginTop: spacing.md,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    width: 220,
  },
  menuUnitTitle: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  menuItemText: {
    ...typography.body,
    color: colors.text.primary,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});
