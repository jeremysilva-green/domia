import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Button, Input } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { MaintenanceCategory, MaintenanceUrgency } from '../../../src/types';

export default function NewTenantMaintenanceScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, tenantProfile } = useAuthStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('other');
  const [urgency, setUrgency] = useState<MaintenanceUrgency>('normal');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [submitted, setSubmitted] = useState(false);

  const categories: { label: string; value: MaintenanceCategory }[] = [
    { label: t.maintenance.plumbing, value: 'plumbing' },
    { label: t.maintenance.electrical, value: 'electrical' },
    { label: t.maintenance.hvac, value: 'hvac' },
    { label: t.maintenance.appliance, value: 'appliance' },
    { label: t.maintenance.structural, value: 'structural' },
    { label: t.maintenance.other, value: 'other' },
  ];

  const urgencies: { label: string; value: MaintenanceUrgency }[] = [
    { label: t.maintenance.low, value: 'low' },
    { label: t.maintenance.normal, value: 'normal' },
    { label: t.maintenance.high, value: 'high' },
    { label: t.maintenance.emergency, value: 'emergency' },
  ];

  // Get the tenant's approved connection to find unit_id and owner_id
  const { data: connection } = useQuery({
    queryKey: ['tenant-connection', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('connection_requests')
        .select('*')
        .eq('tenant_id', user.id)
        .eq('status', 'approved')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as { unit_id: string; owner_id: string } | null;
    },
    enabled: !!user?.id,
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!user?.id || !connection?.unit_id || !connection?.owner_id) {
        throw new Error('Missing connection data');
      }

      const { data: request, error: requestError } = await supabase
        .from('maintenance_requests')
        .insert({
          tenant_id: user.id,
          unit_id: connection.unit_id,
          owner_id: connection.owner_id,
          submitter_name: tenantProfile?.full_name || user.user_metadata?.full_name || null,
          title: title.trim(),
          description: description.trim(),
          category,
          urgency,
          status: 'submitted',
        } as any)
        .select()
        .single();

      if (requestError) throw requestError;

      // Upload images if any
      for (let i = 0; i < images.length; i++) {
        const uri = images[i];
        const fileName = `${request.id}/${Date.now()}-${i}.jpg`;

        const response = await fetch(uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('maintenance-images')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (!uploadError) {
          await supabase.from('maintenance_images').insert({
            maintenance_request_id: request.id,
            storage_path: fileName,
          });
        }
      }

      return request;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-maintenance-requests'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-requests'] });
      setSubmitted(true);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.tenantRequests.submitFailed);
    },
  });

  const pickImage = async () => {
    if (images.length >= 5) {
      Alert.alert(t.tenantRequests.imageLimit, t.tenantRequests.imageLimitMsg);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!title.trim()) {
      newErrors.title = t.tenantRequests.titleRequired;
    }

    if (!description.trim()) {
      newErrors.description = t.tenantRequests.descriptionRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    submitRequest.mutate();
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.successIcon}>
            <Feather name="check-circle" size={40} color={colors.success.main} />
          </View>
          <Text style={styles.successTitle}>{t.tenantRequests.requestSubmitted}</Text>
          <Text style={styles.successMessage}>
            {t.tenantRequests.requestSubmittedMsg}
          </Text>
          <Button
            title={t.tenantRequests.backToRequests}
            onPress={() => router.back()}
            fullWidth
            style={styles.backButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.tenantRequests.reportIssue}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Input
            label={t.tenantRequests.whatsTheIssue}
            placeholder={t.tenantRequests.issuePlaceholder}
            value={title}
            onChangeText={setTitle}
            error={errors.title}
          />

          <Input
            label={t.maintenance.description}
            placeholder={t.tenantRequests.describeIssue}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            error={errors.description}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t.maintenance.category}</Text>
            <View style={styles.optionsGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    styles.optionButton,
                    category === cat.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      category === cat.value && styles.optionTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t.maintenance.urgency}</Text>
            <View style={styles.optionsRow}>
              {urgencies.map((urg) => (
                <TouchableOpacity
                  key={urg.value}
                  style={[
                    styles.urgencyButton,
                    urgency === urg.value && styles.urgencyButtonActive,
                    urg.value === 'emergency' && styles.urgencyEmergency,
                    urg.value === 'emergency' &&
                      urgency === urg.value &&
                      styles.urgencyEmergencyActive,
                  ]}
                  onPress={() => setUrgency(urg.value)}
                >
                  <Text
                    style={[
                      styles.urgencyText,
                      urgency === urg.value && styles.urgencyTextActive,
                      urg.value === 'emergency' &&
                        urgency === urg.value &&
                        styles.urgencyTextEmergency,
                    ]}
                  >
                    {urg.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t.tenantRequests.photosOptional}</Text>
            <View style={styles.imageGrid}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                  >
                    <Feather name="x" size={12} color={colors.white} />
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 5 && (
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={pickImage}
                >
                  <Feather name="camera" size={20} color={colors.text.secondary} />
                  <Text style={styles.addImageLabel}>{t.tenantRequests.addPhoto}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Button
            title={t.tenantRequests.submitRequest}
            onPress={handleSubmit}
            loading={submitRequest.isPending}
            fullWidth
            style={styles.submitButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 24,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionButtonActive: {
    borderColor: '#facc15',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  optionText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  optionTextActive: {
    color: '#facc15',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  urgencyButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  urgencyButtonActive: {
    borderColor: '#facc15',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  urgencyEmergency: {
    borderColor: colors.error.light,
  },
  urgencyEmergencyActive: {
    borderColor: colors.error.main,
    backgroundColor: colors.error.light,
  },
  urgencyText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  urgencyTextActive: {
    color: '#facc15',
  },
  urgencyTextEmergency: {
    color: colors.error.dark,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  imageContainer: {
    position: 'relative',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error.main,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addImageLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    fontSize: 10,
  },
  submitButton: {
    marginTop: spacing.md,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.success.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  successMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  backButton: {
    marginTop: spacing.md,
  },
});
