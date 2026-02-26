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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../../../../src/services/supabase';
import { Button, Input, Card } from '../../../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../../../src/constants/theme';
import { MaintenanceCategory, MaintenanceUrgency } from '../../../../../src/types';

const categories: { label: string; value: MaintenanceCategory }[] = [
  { label: 'Plumbing', value: 'plumbing' },
  { label: 'Electrical', value: 'electrical' },
  { label: 'HVAC', value: 'hvac' },
  { label: 'Appliance', value: 'appliance' },
  { label: 'Structural', value: 'structural' },
  { label: 'Other', value: 'other' },
];

const urgencies: { label: string; value: MaintenanceUrgency }[] = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Emergency', value: 'emergency' },
];

export default function NewMaintenanceRequestScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('other');
  const [urgency, setUrgency] = useState<MaintenanceUrgency>('normal');
  const [images, setImages] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>(
    {}
  );
  const [submitted, setSubmitted] = useState(false);

  // Get tenant info from portal token
  const { data: tenant } = useQuery({
    queryKey: ['portal-tenant', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, unit_id, unit:units(property:properties(name))')
        .eq('portal_token', token)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });

  const submitRequest = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('No tenant');

      // Create maintenance request
      const { data: request, error: requestError } = await supabase
        .from('maintenance_requests')
        .insert({
          tenant_id: tenant.id,
          unit_id: tenant.unit_id,
          title: title.trim(),
          description: description.trim(),
          category,
          urgency,
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Upload images
      for (let i = 0; i < images.length; i++) {
        const uri = images[i];
        const fileName = `${request.id}/${Date.now()}-${i}.jpg`;

        // Convert URI to blob
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
      setSubmitted(true);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to submit request');
    },
  });

  const pickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Limit Reached', 'You can only upload up to 5 images');
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
      newErrors.title = 'Please provide a brief title';
    }

    if (!description.trim()) {
      newErrors.description = 'Please describe the issue';
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
            <Text style={styles.successEmoji}>...</Text>
          </View>
          <Text style={styles.successTitle}>Request Submitted</Text>
          <Text style={styles.successMessage}>
            Your maintenance request has been submitted. Your property manager
            will review it shortly.
          </Text>
          <Button
            title="Back to Portal"
            onPress={() => router.replace(`/(public)/portal/${token}`)}
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
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report Issue</Text>
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
            label="What's the issue?"
            placeholder="e.g., Leaky faucet in bathroom"
            value={title}
            onChangeText={setTitle}
            error={errors.title}
          />

          <Input
            label="Description"
            placeholder="Please describe the issue in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            error={errors.description}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Category</Text>
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
            <Text style={styles.sectionLabel}>Urgency</Text>
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
            <Text style={styles.sectionLabel}>Photos (optional)</Text>
            <View style={styles.imageGrid}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => removeImage(index)}
                  >
                    <Text style={styles.removeImageText}>X</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {images.length < 5 && (
                <TouchableOpacity
                  style={styles.addImageButton}
                  onPress={pickImage}
                >
                  <Text style={styles.addImageText}>+</Text>
                  <Text style={styles.addImageLabel}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Button
            title="Submit Request"
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
  cancelButton: {
    ...typography.body,
    color: colors.primary[600],
  },
  headerTitle: {
    ...typography.h3,
    color: colors.text.primary,
  },
  headerSpacer: {
    width: 60,
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
    backgroundColor: colors.white,
  },
  optionButtonActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  optionText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  optionTextActive: {
    color: colors.primary[600],
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
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  urgencyButtonActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
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
    color: colors.primary[600],
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
  removeImageText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 12,
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
  },
  addImageText: {
    fontSize: 24,
    color: colors.gray[400],
  },
  addImageLabel: {
    ...typography.caption,
    color: colors.gray[400],
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
  successEmoji: {
    fontSize: 40,
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
