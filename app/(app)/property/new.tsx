import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Button, Input } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { PropertyType } from '../../../src/types';
import { AppAlert } from '../../../src/components/ui/AppAlert';

export default function NewPropertyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { t, language } = useI18n();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; address?: string }>({});

  const propertyTypes: { label: string; value: PropertyType }[] = [
    { label: t.properties.house, value: 'house' },
    { label: t.properties.apartment, value: 'apartment' },
    { label: t.properties.condo, value: 'condo' },
    { label: t.properties.commercial, value: 'commercial' },
  ];

  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      setLogoUri(result.assets[0].uri);
      setLogoBase64(result.assets[0].base64 || null);
    }
  };

  const createProperty = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('properties')
        .insert({
          owner_id: user.id,
          name: name.trim(),
          address: address.trim(),
          city: city.trim() || null,
          property_type: propertyType,
        })
        .select()
        .single();

      if (error) throw error;

      // Upload logo if selected
      if (logoBase64 && data) {
        const fileName = `property-logo-${data.id}-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('property-images')
          .upload(fileName, decode(logoBase64), { contentType: 'image/jpeg', upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('property-images').getPublicUrl(fileName);
          await supabase
            .from('properties')
            .update({ logo_url: urlData.publicUrl } as any)
            .eq('id', data.id);
        }
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['properties-with-units'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      router.replace(`/(app)/property/${data.id}`);
    },
    onError: (error: any) => {
      AppAlert.alert(t.common.error, error.message || t.properties.createFailed);
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = t.properties.propertyNameRequired;
    if (!address.trim()) newErrors.address = t.properties.addressRequired;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createProperty.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancelButton}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t.properties.newProperty}</Text>
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
          {/* Logo Upload */}
          <View style={styles.logoSection}>
            <TouchableOpacity style={styles.logoButton} onPress={handlePickLogo}>
              {logoUri ? (
                <Image source={{ uri: logoUri }} style={styles.logoPreview} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Feather name="image" size={28} color={colors.text.secondary} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoTextButton} onPress={handlePickLogo}>
              <Feather name="upload" size={14} color={colors.yellow} />
              <Text style={styles.logoTextButtonLabel}>
                {language === 'es' ? 'Subir Logotipo' : 'Upload Logo'}
              </Text>
            </TouchableOpacity>
          </View>

          <Input
            label={t.properties.propertyName}
            placeholder={t.properties.propertyNamePlaceholder}
            value={name}
            onChangeText={setName}
            error={errors.name}
          />

          <Input
            label={t.properties.address}
            placeholder={t.properties.addressPlaceholder}
            value={address}
            onChangeText={setAddress}
            error={errors.address}
          />

          <Input
            label={t.properties.city}
            placeholder={t.properties.cityPlaceholder}
            value={city}
            onChangeText={setCity}
          />

          <View style={styles.typeSection}>
            <Text style={styles.typeLabel}>{t.properties.type}</Text>
            <View style={styles.typeGrid}>
              {propertyTypes.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    propertyType === type.value && styles.typeButtonActive,
                  ]}
                  onPress={() => setPropertyType(type.value)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      propertyType === type.value && styles.typeButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Button
            title={t.properties.createProperty}
            onPress={handleSubmit}
            loading={createProperty.isPending}
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
    color: '#facc15',
  },
  title: {
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
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  logoButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoTextButtonLabel: {
    ...typography.bodySmall,
    color: colors.yellow,
    fontWeight: '600',
  },
  typeSection: {
    marginBottom: spacing.lg,
  },
  typeLabel: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeButtonActive: {
    borderColor: '#facc15',
    backgroundColor: colors.surfaceLight,
  },
  typeButtonText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  typeButtonTextActive: {
    color: '#facc15',
  },
  submitButton: {
    marginTop: spacing.lg,
  },
});
