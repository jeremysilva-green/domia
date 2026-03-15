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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Card, Button, ConfirmDialog } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

type PropertyItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  owner_id: string;
  owner: { full_name: string; profile_image_url?: string | null } | null;
};

type RequestItem = {
  id: string;
  owner_id: string;
  property_id: string | null;
  unit_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  unit: { property_id: string } | null;
};

export default function OwnersListScreen() {
  const { t } = useI18n();
  const { user, tenantProfile } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string; confirmText: string; destructive?: boolean; hideCancel?: boolean; onConfirm: () => void } | null>(null);
  const isFocused = useIsFocused();

  // Navigate to profile setup when this tab is focused and setup not yet completed.
  // Checks user metadata (available synchronously) rather than tenantProfile.full_name,
  // because full_name is set during sign-up and doesn't indicate profile setup is done.
  useEffect(() => {
    if (isFocused && user && !user.user_metadata?.profile_setup_completed) {
      router.push('/(tenant)/profile-setup' as any);
    }
  }, [isFocused, user]);

  // Fetch all properties with owner info
  const { data: properties = [], refetch } = useQuery<PropertyItem[]>({
    queryKey: ['all-properties', searchQuery],
    queryFn: async (): Promise<PropertyItem[]> => {
      let query = supabase
        .from('properties')
        .select('id, name, address, city, owner_id, owner:owners(full_name, profile_image_url)')
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
        .select('id, owner_id, property_id, unit_id, status, unit:units(property_id)')
        .eq('tenant_id', user.id);

      if (error) throw error;
      return (data ?? []) as unknown as RequestItem[];
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
    setDialog({
      title: t.tenantHome.disconnectConfirm,
      message: t.tenantHome.disconnectConfirmMsg,
      confirmText: t.tenantHome.disconnectConfirm,
      destructive: true,
      onConfirm: () => disconnectMutation.mutate({ id: request.id, unit_id: request.unit_id }),
    });
  };

  // Send connection request
  const sendRequest = useMutation({
    mutationFn: async ({ ownerId, propertyId }: { ownerId: string; propertyId: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const tenantName = tenantProfile?.full_name || user.user_metadata?.full_name || 'Unknown';
      const tenantEmail = tenantProfile?.email || user.email || '';
      const tenantPhone = tenantProfile?.phone || user.user_metadata?.phone || null;
      const tenantRuc = tenantProfile?.ruc || user.user_metadata?.ruc || null;
      const tenantRazonSocial = tenantProfile?.razon_social || user.user_metadata?.razon_social || null;

      // Delete any previously rejected request for this specific property
      await supabase
        .from('connection_requests')
        .delete()
        .eq('tenant_id', user.id)
        .eq('owner_id', ownerId)
        .eq('status', 'rejected');

      const { error } = await (supabase
        .from('connection_requests') as any)
        .insert({
          tenant_id: user.id,
          owner_id: ownerId,
          property_id: propertyId,
          tenant_name: tenantName,
          tenant_email: tenantEmail,
          tenant_phone: tenantPhone,
          tenant_ruc: tenantRuc,
          tenant_razon_social: tenantRazonSocial,
          status: 'pending',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-connection-requests'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-connection'] });
      setDialog({
        title: t.owners.requestSent,
        message: t.owners.requestSentMsg,
        confirmText: 'OK',
        onConfirm: () => setDialog(null),
      });
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

  const getRequest = (property: PropertyItem) =>
    existingRequests.find((r) => {
      // New records: match directly by property_id
      if (r.property_id) return r.property_id === property.id;
      // Fallback for old records: approved requests linked via unit
      if (r.status === 'approved' && r.unit?.property_id) return r.unit.property_id === property.id;
      // Legacy fallback: match by owner (old requests without property_id)
      return r.owner_id === property.owner_id;
    });

  const handleSendRequest = (property: PropertyItem) => {
    const activeConnection = existingRequests.find((r) => r.status === 'approved');
    if (activeConnection) {
      setDialog({
        title: t.owners.alreadyConnectedTitle,
        message: t.owners.alreadyConnectedMsg,
        confirmText: 'OK',
        onConfirm: () => setDialog(null),
      });
      return;
    }
    setDialog({
      title: t.owners.sendRequest,
      message: `${t.owners.sendRequestConfirm} ${property.name}?`,
      confirmText: t.owners.sendRequest,
      onConfirm: () => sendRequest.mutate({ ownerId: property.owner_id, propertyId: property.id }),
    });
  };

  const renderPropertyItem = ({ item }: { item: PropertyItem }) => {
    const request = getRequest(item);
    const status = request?.status;

    return (
      <Card style={styles.propertyCard}>
        <View style={styles.propertyInfo}>
          {item.owner?.profile_image_url ? (
            <Image source={{ uri: item.owner.profile_image_url }} style={styles.ownerAvatar} />
          ) : (
            <View style={styles.propertyIcon}>
              <Feather name="home" size={22} color={colors.yellow} />
            </View>
          )}
          <View style={styles.propertyDetails}>
            <Text style={styles.propertyName}>{item.name}</Text>
            <Text style={styles.propertyAddress} numberOfLines={1}>{item.address}</Text>
          </View>
        </View>

        {status === 'pending' ? (
          <View style={styles.pendingBadge}>
            <Feather name="clock" size={14} color={colors.warning.main} />
            <Text style={styles.pendingText}>{t.owners.pending}</Text>
          </View>
        ) : status === 'approved' && request ? (
          <View style={styles.connectedBadge}>
            <Feather name="check-circle" size={13} color="#22c55e" />
            <Text style={styles.connectedText}>{t.owners.connected}</Text>
          </View>
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
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message}
        confirmText={dialog?.confirmText}
        cancelText={t.common.cancel}
        destructive={dialog?.destructive}
        hideCancel={dialog?.hideCancel}
        onConfirm={() => { dialog?.onConfirm(); setDialog(null); }}
        onCancel={() => setDialog(null)}
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
  ownerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#16a34a22',
    borderRadius: 20,
  },
  connectedText: {
    ...typography.caption,
    fontWeight: '600',
    color: '#22c55e',
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
