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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { useI18n } from '../../../src/i18n';
import { Button, Input } from '../../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../../src/constants/theme';
import { PropertyType } from '../../../src/types';

export default function NewPropertyScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
  const [errors, setErrors] = useState<{ name?: string; address?: string }>({});

  const propertyTypes: { label: string; value: PropertyType }[] = [
    { label: t.properties.house, value: 'house' },
    { label: t.properties.apartment, value: 'apartment' },
    { label: t.properties.condo, value: 'condo' },
    { label: t.properties.commercial, value: 'commercial' },
  ];

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
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      router.replace(`/(app)/property/${data.id}`);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.properties.createFailed);
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = t.properties.propertyNameRequired;
    }

    if (!address.trim()) {
      newErrors.address = t.properties.addressRequired;
    }

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
