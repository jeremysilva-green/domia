import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/services/supabase';
import { Card, Button, Badge } from '../../../../src/components/ui';
import { RentIndicator } from '../../../../src/components/shared';
import { colors, spacing, typography } from '../../../../src/constants/theme';
import { PropertyWithUnits, RentStatus } from '../../../../src/types';
import { useI18n } from '../../../../src/i18n';
import { formatMonthlyRent } from '../../../../src/utils/currency';

export default function PropertyDetailScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

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

  const deleteProperty = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('properties').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
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
              <Text style={styles.propertyNameLight}>{property.name}</Text>
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
            <Text style={styles.propertyName}>{property.name}</Text>
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
            <TouchableOpacity
              onPress={() => router.push(`/(app)/property/${id}/unit/new`)}
            >
              <Text style={styles.addLink}>+ {t.units.addUnit}</Text>
            </TouchableOpacity>
          </View>

          {property.units.length > 0 ? (
            property.units.map((unit) => (
              <Card
                key={unit.id}
                style={styles.unitCard}
                onPress={() => router.push(`/(app)/property/${id}/unit/${unit.id}`)}
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
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t.units.noUnitsYet}</Text>
              <Button
                title={t.units.addFirstUnit}
                onPress={() => router.push(`/(app)/property/${id}/unit/new`)}
                style={styles.emptyButton}
              />
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
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
});
