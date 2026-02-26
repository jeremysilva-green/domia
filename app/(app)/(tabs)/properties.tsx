// Force rebundle: 2026-02-04T21:30:00
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Card, Button } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { PropertyWithUnits } from '../../../src/types';

function PropertyCard({ property }: { property: PropertyWithUnits }) {
  const router = useRouter();
  const occupiedCount = property.units.filter(
    (u: any) => u.tenants?.some((t: any) => t.status === 'active')
  ).length;
  const totalCount = property.units.length;

  return (
    <Card
      style={styles.propertyCard}
      onPress={() => router.push(`/(app)/property/${property.id}`)}
    >
      <View style={styles.propertyHeader}>
        <View style={styles.propertyInfo}>
          <Text style={styles.propertyName}>{property.name}</Text>
          <Text style={styles.propertyAddress}>{property.address}</Text>
        </View>
        {totalCount > 0 && (
          <View style={styles.occupancyBadge}>
            <Text style={styles.occupancyText}>
              {occupiedCount}/{totalCount}
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

export default function PropertiesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: properties,
    isLoading,
    refetch,
  } = useQuery<PropertyWithUnits[]>({
    queryKey: ['properties', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('properties')
        .select(
          `
          *,
          units (
            id,
            status,
            tenants (id, status)
          )
        `
        )
        .eq('owner_id', user.id)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>{t.properties.noProperties}</Text>
      <Text style={styles.emptySubtitle}>
        {t.properties.noPropertiesSubtitle}
      </Text>
      <Button
        title={t.properties.addProperty}
        onPress={() => router.push('/(app)/property/new')}
        style={styles.emptyButton}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.properties.title}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/(app)/property/new')}
        >
          <Text style={styles.addButtonText}>+ {t.common.add}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PropertyCard property={item} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!isLoading ? renderEmpty : null}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  addButton: {
    backgroundColor: '#facc15',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  addButtonText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.background,
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  propertyCard: {
    marginBottom: spacing.md,
  },
  propertyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    ...typography.h3,
    color: colors.text.primary,
  },
  propertyAddress: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    marginTop: 2,
  },
  occupancyBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },
  occupancyText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: '#facc15',
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
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  emptyButton: {
    marginTop: spacing.md,
  },
});
