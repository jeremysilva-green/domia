import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../../../src/services/supabase';
import { useI18n } from '../../../src/i18n';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { MaintenanceRequestWithImages } from '../../../src/types';

export default function MaintenanceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: request, isLoading } = useQuery<MaintenanceRequestWithImages>({
    queryKey: ['maintenance-request', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select(`
          *,
          tenant:tenants(full_name),
          unit:units(
            unit_number,
            property:properties(name)
          ),
          images:maintenance_images(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Resolve tenant name if missing
      if (data && data.tenant_id && !data.submitter_name && !data.tenant?.full_name) {
        const { data: conn } = await supabase
          .from('connection_requests')
          .select('tenant_name')
          .eq('tenant_id', data.tenant_id)
          .single();
        if (conn) (data as any).submitter_name = conn.tenant_name;
      }

      return data as MaintenanceRequestWithImages;
    },
    enabled: !!id,
  });

  const markFixed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-request', id] });
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message);
    },
  });

  const handleMarkFixed = () => {
    markFixed.mutate();
  };

  const tenantName = request?.tenant?.full_name || (request as any)?.submitter_name || null;
  const locationText = request?.unit?.property?.name
    ? `${request.unit.property.name}${request.unit?.unit_number ? ` · ${request.unit.unit_number}` : ''}`
    : t.maintenance.publicRequest;

  const isCompleted = request?.status === 'completed';

  const statusLabel: Record<string, string> = {
    submitted: t.maintenance.submitted,
    in_progress: t.maintenance.inProgress,
    completed: t.maintenance.completed,
    cancelled: t.maintenance.cancelled,
  };

  const urgencyLabel: Record<string, string> = {
    emergency: t.maintenance.emergency,
    high: t.maintenance.high,
  };

  const statusColor = {
    submitted: colors.warning.main,
    in_progress: '#3b82f6',
    completed: colors.success.main,
    cancelled: colors.text.secondary,
  }[request?.status ?? 'submitted'] ?? colors.text.secondary;

  const urgencyColor = {
    emergency: colors.error.main,
    high: colors.warning.main,
    normal: colors.text.secondary,
    low: colors.text.secondary,
  }[request?.urgency ?? 'normal'] ?? colors.text.secondary;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.yellow} />
        </View>
      </SafeAreaView>
    );
  }

  if (!request) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {request.title}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {statusLabel[request.status] ?? request.status.replace('_', ' ')}
            </Text>
          </View>
          {request.urgency !== 'normal' && request.urgency !== 'low' && (
            <View style={[styles.badge, { backgroundColor: urgencyColor + '22' }]}>
              <Text style={[styles.badgeText, { color: urgencyColor }]}>
                {urgencyLabel[request.urgency ?? ''] ?? request.urgency}
              </Text>
            </View>
          )}
          <Text style={styles.date}>
            {format(new Date(request.created_at), 'MMM d, yyyy')}
          </Text>
        </View>

        {/* Tenant & location */}
        <View style={styles.infoCard}>
          {tenantName && (
            <View style={styles.infoRow}>
              <Feather name="user" size={16} color={colors.text.secondary} />
              <Text style={styles.infoText}>{tenantName}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Feather name="map-pin" size={16} color={colors.text.secondary} />
            <Text style={styles.infoText}>{locationText}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t.maintenance.description || 'Description'}
          </Text>
          <Text style={styles.description}>{request.description}</Text>
        </View>

        {/* Photos */}
        {request.images && request.images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t.maintenance.photos || 'Photos'}
            </Text>
            <View style={styles.photosGrid}>
              {request.images.map((img: any) => (
                <Image
                  key={img.id}
                  source={{ uri: img.image_url }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </View>
          </View>
        )}

        {/* Mark fixed button */}
        {!isCompleted && (
          <TouchableOpacity
            style={styles.fixedButton}
            onPress={handleMarkFixed}
            disabled={markFixed.isPending}
          >
            {markFixed.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Feather name="check-circle" size={18} color={colors.white} />
                <Text style={styles.fixedButtonText}>{t.maintenance.fixed}</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {isCompleted && request.completed_at && (
          <View style={styles.completedBanner}>
            <Feather name="check-circle" size={16} color={colors.success.main} />
            <Text style={styles.completedText}>
              {`${t.maintenance.completed} ${format(new Date(request.completed_at as string), 'MMM d, yyyy')}`}
            </Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  date: {
    ...typography.caption,
    color: colors.text.secondary,
    marginLeft: 'auto',
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    ...typography.body,
    color: colors.text.primary,
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    color: colors.text.primary,
    lineHeight: 22,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photo: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  fixedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success.main,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  fixedButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.white,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.success.main + '22',
    borderRadius: borderRadius.md,
  },
  completedText: {
    ...typography.body,
    color: colors.success.main,
    fontWeight: '600',
  },
});
