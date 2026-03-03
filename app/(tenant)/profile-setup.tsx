import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useI18n } from '../../src/i18n';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/constants/theme';
import { supabase } from '../../src/services/supabase';

export default function TenantProfileSetupScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { user, tenantProfile, updateTenantProfile } = useAuthStore();

  const [fullName, setFullName] = useState(tenantProfile?.full_name || '');
  const [email, setEmail] = useState(tenantProfile?.email || user?.email || '');
  const [phone, setPhone] = useState(tenantProfile?.phone || '+595');
  const [ruc, setRuc] = useState(tenantProfile?.ruc || '');
  const [razonSocial, setRazonSocial] = useState(tenantProfile?.razon_social || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});

  const validate = () => {
    const newErrors: typeof errors = {};
    if (!fullName.trim()) newErrors.fullName = t.profileSetup.fullNameRequired;
    if (!phone.trim()) newErrors.phone = t.profileSetup.phoneRequired;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await updateTenantProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        ruc: ruc.trim() || null,
        razon_social: razonSocial.trim() || null,
        // Mark profile setup as completed via user metadata
      } as any);

      // Mark profile_setup_completed in user metadata
      await supabase.auth.updateUser({
        data: {
          ...user?.user_metadata,
          profile_setup_completed: true,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          ruc: ruc.trim() || null,
          razon_social: razonSocial.trim() || null,
        },
      });

      // Sync to tenants table so the owner sees updated info immediately
      if (user?.id) {
        await supabase
          .from('tenants')
          .update({
            full_name: fullName.trim() || null,
            phone: phone.trim() || null,
            ruc: ruc.trim() || null,
            razon_social: razonSocial.trim() || null,
          } as any)
          .eq('id', user.id);
      }

      router.replace('/(tenant)/(tabs)');
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || t.common.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Feather name="user" size={32} color={colors.yellow} />
            </View>
            <Text style={styles.title}>{t.profileSetup.title}</Text>
            <Text style={styles.subtitle}>{t.profileSetup.subtitle}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label={t.tenants.fullName}
              placeholder={t.profileSetup.fullNamePlaceholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              error={errors.fullName}
            />

            <Input
              label={t.tenants.email}
              placeholder={t.profileSetup.emailPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Input
              label={t.tenants.phone}
              placeholder={t.profileSetup.phonePlaceholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />

            <Input
              label={t.tenants.ruc}
              placeholder={t.profileSetup.rucPlaceholder}
              value={ruc}
              onChangeText={setRuc}
              keyboardType="number-pad"
            />

            <Input
              label={t.tenants.razonSocial}
              placeholder={t.profileSetup.razonSocialPlaceholder}
              value={razonSocial}
              onChangeText={setRazonSocial}
              autoCapitalize="words"
            />
          </View>

          <Button
            title={t.profileSetup.continue}
            onPress={handleContinue}
            loading={saving}
            fullWidth
            style={styles.continueButton}
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
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.yellow + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    marginBottom: spacing.md,
  },
  continueButton: {
    marginTop: spacing.md,
  },
});
