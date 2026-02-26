import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Card, Button } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

type PropertyItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  owner_id: string;
  owner: { full_name: string } | null;
};

type RequestItem = {
  id: string;
  owner_id: string;
  unit_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
};

export default function OwnersListScreen() {
  const { t } = useI18n();
  const { user, tenantProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch all properties with owner info
  const { data: properties = [], refetch } = useQuery<PropertyItem[]>({
    queryKey: ['all-properties', searchQuery],
    queryFn: async (): Promise<PropertyItem[]> => {
      let query = supabase
        .from('properties')
        .select('id, name, address, city, owner_id, owner:owners(full_name)')
        .order('name', { ascending: true });

      if (searchQuery.trim()) {
        query = query.or(
          `name.ilike.%${searchQuery.trim()}%,address.ilike.%${searchQuery.trim()}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PropertyItem[];
    },
  });

  // Get existing connection requests for this tenant
  const { data: existingRequests = [] } = useQuery<RequestItem[]>({
    queryKey: ['my-connection-requests', user?.id],
    queryFn: async (): Promise<RequestItem[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('connection_requests')
        .select('id, owner_id, unit_id, status')
        .eq('tenant_id', user.id);

      if (error) throw error;
      return (data ?? []) as RequestItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  // Disconnect from owner
  const disconnectMutation = useMutation({
    mutationFn: async (request: { id: string; unit_id: string | null }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Get unit_id from the request; fall back to the tenants table
      let unitId: string | null = request.unit_id;
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
        .eq('id', request.id);
      if (reqError) throw reqError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-connection'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-payments'] });
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to disconnect. Please try again.');
    },
  });

  const handleDisconnect = (request: RequestItem) => {
    Alert.alert(
      t.tenantHome.disconnectConfirm,
      t.tenantHome.disconnectConfirmMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.tenantHome.disconnectConfirm,
          style: 'destructive',
          onPress: () => disconnectMutation.mutate({ id: request.id, unit_id: request.unit_id }),
        },
      ]
    );
  };

  // Send connection request
  const sendRequest = useMutation({
    mutationFn: async (ownerId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const tenantName = tenantProfile?.full_name || user.user_metadata?.full_name || 'Unknown';
      const tenantEmail = tenantProfile?.email || user.email || '';
      const tenantPhone = tenantProfile?.phone || user.user_metadata?.phone || null;

      // Delete any previously rejected request so a new one can be inserted
      await supabase
        .from('connection_requests')
        .delete()
        .eq('tenant_id', user.id)
        .eq('owner_id', ownerId)
        .eq('status', 'rejected');

      const { error } = await supabase
        .from('connection_requests')
        .insert({
          tenant_id: user.id,
          owner_id: ownerId,
          tenant_name: tenantName,
          tenant_email: tenantEmail,
          tenant_phone: tenantPhone,
          status: 'pending',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-connection'] });
      Alert.alert(t.owners.requestSent, t.owners.requestSentMsg);
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        Alert.alert(t.owners.alreadyRequested, t.owners.alreadyRequestedMsg);
      } else {
        Alert.alert(t.common.error, error.message || t.common.error);
      }
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Subscribe to real-time connection_requests changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`tenant-owners-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'connection_requests',
          filter: `tenant_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['my-connection-requests', user.id] });
          queryClient.invalidateQueries({ queryKey: ['tenant-connection', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const getRequest = (ownerId: string) =>
    existingRequests.find((r) => r.owner_id === ownerId);

  const handleSendRequest = (property: PropertyItem) => {
    Alert.alert(
      t.owners.sendRequest,
      `${t.owners.sendRequestConfirm} ${property.name}?`,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.owners.sendRequest,
          onPress: () => sendRequest.mutate(property.owner_id),
        },
      ]
    );
  };

  const renderPropertyItem = ({ item }: { item: PropertyItem }) => {
    const request = getRequest(item.owner_id);
    const status = request?.status;

    return (
      <Card style={styles.propertyCard}>
        <View style={styles.propertyInfo}>
          <View style={styles.propertyIcon}>
            <Feather name="home" size={22} color={colors.yellow} />
          </View>
          <View style={styles.propertyDetails}>
            <Text style={styles.propertyName}>{item.name}</Text>
            <Text style={styles.propertyAddress} numberOfLines={1}>{item.address}</Text>
            {item.owner?.full_name ? (
              <Text style={styles.ownerName} numberOfLines={1}>
                {item.owner.full_name}
              </Text>
            ) : null}
          </View>
        </View>

        {status === 'pending' ? (
          <View style={styles.pendingBadge}>
            <Feather name="clock" size={14} color={colors.warning.main} />
            <Text style={styles.pendingText}>{t.owners.pending}</Text>
          </View>
        ) : status === 'approved' && request ? (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={() => handleDisconnect(request)}
            disabled={disconnectMutation.isPending}
          >
            <Feather name="log-out" size={13} color={colors.error.main} />
            <Text style={styles.disconnectText}>{t.tenantHome.disconnectConfirm}</Text>
          </TouchableOpacity>
        ) : status === 'rejected' ? (
          <Button
            title={t.owners.tryAgain}
            variant="outline"
            size="sm"
            onPress={() => handleSendRequest(item)}
            loading={sendRequest.isPending}
          />
        ) : (
          <Button
            title={t.owners.connect}
            variant="outline"
            size="sm"
            onPress={() => handleSendRequest(item)}
            loading={sendRequest.isPending}
          />
        )}
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.owners.title}</Text>
        <Text style={styles.subtitle}>{t.owners.subtitle}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Feather name="search" size={20} color={colors.text.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t.owners.searchPlaceholder}
            placeholderTextColor={colors.text.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={properties}
        renderItem={renderPropertyItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="home" size={48} color={colors.text.secondary} />
            <Text style={styles.emptyText}>
              {searchQuery ? t.owners.noOwnersSearch : t.owners.noOwners}
            </Text>
          </View>
        }
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text.primary,
    paddingVertical: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  propertyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  propertyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    marginRight: spacing.sm,
  },
  propertyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  propertyDetails: {
    flex: 1,
  },
  propertyName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  propertyAddress: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 2,
  },
  ownerName: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: 1,
    fontStyle: 'italic',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.warning.light,
    borderRadius: 20,
  },
  pendingText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.warning.main,
  },
  rejectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.error.light,
    borderRadius: 20,
  },
  rejectedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.error.main,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.error.light,
    borderRadius: 20,
  },
  disconnectText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.error.main,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.text.secondary,
  },
});
