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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../../../../../src/services/supabase';
import { Card, Button } from '../../../../../src/components/ui';
import { StatusBadge } from '../../../../../src/components/shared';
import { colors, spacing, typography } from '../../../../../src/constants/theme';

export default function TenantMaintenanceListScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: tenant } = useQuery({
    queryKey: ['portal-tenant', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('portal_token', token)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });

  const {
    data: requests,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['portal-maintenance', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('*')
        .eq('tenant_id', tenant!.id)
        .order('created_at', { ascending: false });

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

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No maintenance requests</Text>
      <Text style={styles.emptySubtitle}>
        When you submit maintenance requests, they will appear here.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Maintenance</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(`/(public)/portal/${token}/maintenance/new`)
          }
        >
          <Text style={styles.addButton}>+ New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Card style={styles.requestCard}>
            <View style={styles.requestHeader}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestTitle}>{item.title}</Text>
                <Text style={styles.requestDate}>
                  {format(new Date(item.created_at), 'MMM d, yyyy')}
                </Text>
              </View>
              <StatusBadge status={item.status} type="maintenance" size="sm" />
            </View>
            <Text style={styles.requestDescription} numberOfLines={2}>
              {item.description}
            </Text>
            {item.owner_notes && (
              <View style={styles.notesContainer}>
                <Text style={styles.notesLabel}>Manager notes:</Text>
                <Text style={styles.notesText}>{item.owner_notes}</Text>
              </View>
            )}
          </Card>
        )}
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
  backButton: {
    ...typography.body,
    color: colors.primary[600],
    fontWeight: '500',
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
  },
  addButton: {
    ...typography.body,
    color: colors.primary[600],
    fontWeight: '600',
  },
  list: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  requestCard: {
    marginBottom: spacing.md,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  requestInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  requestTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  requestDate: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  requestDescription: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },
  notesContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notesLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 2,
  },
  notesText: {
    ...typography.bodySmall,
    color: colors.text.primary,
  },
  emptyContainer: {
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
  },
});
