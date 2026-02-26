import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../../../src/services/supabase';
import { useAuthStore } from '../../../src/stores/authStore';
import { Button, Input, Card } from '../../../src/components/ui';
import { colors, spacing, typography } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

type Currency = 'USD' | 'PYG';

// Convert DD/MM/YYYY to YYYY-MM-DD for database storage
const convertToISODate = (dateStr: string, isSpanish: boolean): string | null => {
  if (!dateStr) return null;
  if (!isSpanish) return dateStr; // Already in YYYY-MM-DD format

  // Convert DD/MM/YYYY to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
};

export default function NewTenantScreen() {
  const { t, language } = useI18n();
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [leaseStart, setLeaseStart] = useState('');
  const [leaseEnd, setLeaseEnd] = useState('');

  // Fetch unit data to auto-populate rent amount and currency
  const { data: unit } = useQuery({
    queryKey: ['unit', unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units')
        .select('rent_amount, currency, unit_number')
        .eq('id', unitId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!unitId,
  });

  // Auto-populate rent amount and currency from unit
  useEffect(() => {
    if (unit) {
      if (unit.rent_amount) {
        setRentAmount(unit.rent_amount.toString());
      }
      if (unit.currency) {
        setCurrency(unit.currency as Currency);
      }
    }
  }, [unit]);
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    rentAmount?: string;
    leaseStart?: string;
    leaseEnd?: string;
  }>({});

  const createTenant = useMutation({
    mutationFn: async (): Promise<{ id: string }> => {
      if (!user?.id) throw new Error('Not authenticated');

      const isSpanish = language === 'es';

      const { data, error } = await supabase
        .from('tenants')
        .insert({
          owner_id: user.id,
          unit_id: unitId || null,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          rent_amount: parseFloat(rentAmount),
          lease_start: convertToISODate(leaseStart, isSpanish),
          lease_end: convertToISODate(leaseEnd, isSpanish),
          status: 'active',
          onboarding_completed: true,
        } as any)
        .select('id')
        .single();

      if (error) throw error;

      // Update unit status to occupied if tenant is linked to a unit
      if (unitId) {
        await (supabase
          .from('units') as any)
          .update({ status: 'occupied' })
          .eq('id', unitId);
      }

      return data as { id: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['property'] });
      router.replace(`/(app)/tenant/${data.id}`);
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.tenants.addTenantFailed);
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = t.tenants.fullNameRequired;
    }

    if (!email.trim()) {
      newErrors.email = t.tenants.emailRequired;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t.tenants.emailInvalid;
    }

    if (!phone.trim()) {
      newErrors.phone = t.tenants.phoneRequired;
    }

    // Only validate rent if not coming from unit
    if (!unitId || !unit) {
      if (!rentAmount.trim()) {
        newErrors.rentAmount = t.tenants.monthlyRentRequired;
      } else if (isNaN(parseFloat(rentAmount)) || parseFloat(rentAmount) <= 0) {
        newErrors.rentAmount = t.tenants.rentInvalid;
      }
    }

    // Validate date format based on language
    const dateRegex = language === 'es'
      ? /^\d{2}\/\d{2}\/\d{4}$/ // DD/MM/YYYY for Spanish
      : /^\d{4}-\d{2}-\d{2}$/;  // YYYY-MM-DD for English

    if (leaseStart && !dateRegex.test(leaseStart)) {
      newErrors.leaseStart = t.tenants.dateFormatError;
    }

    if (leaseEnd && !dateRegex.test(leaseEnd)) {
      newErrors.leaseEnd = t.tenants.dateFormatError;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    createTenant.mutate();
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelButton}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t.tenants.addTenant}</Text>
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
          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t.tenants.personalInfo}</Text>

            <Input
              label={t.tenants.fullName}
              placeholder={t.tenants.fullNamePlaceholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              error={errors.fullName}
            />

            <Input
              label={t.tenants.email}
              placeholder={t.tenants.emailPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <Input
              label={t.tenants.phone}
              placeholder={t.tenants.phonePlaceholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>{t.tenants.leaseDetails}</Text>

            {unitId && unit ? (
              <View style={styles.rentFromUnit}>
                <Text style={styles.rentFromUnitLabel}>{t.units.monthlyRent}</Text>
                <Text style={styles.rentFromUnitValue}>
                  {currency === 'PYG' ? '₲' : '$'}{unit.rent_amount?.toLocaleString()}
                </Text>
                <Text style={styles.rentFromUnitHint}>
                  {unit.unit_number}
                </Text>
              </View>
            ) : (
              <Input
                label={currency === 'USD' ? t.tenants.monthlyRentUSD : t.tenants.monthlyRentPYG}
                placeholder={currency === 'USD' ? '1500' : '5000000'}
                value={rentAmount}
                onChangeText={setRentAmount}
                keyboardType="decimal-pad"
                error={errors.rentAmount}
              />
            )}

            <Input
              label={t.tenants.leaseStartDate}
              placeholder={t.tenants.datePlaceholder}
              value={leaseStart}
              onChangeText={setLeaseStart}
              error={errors.leaseStart}
              hint={t.tenants.leaseStartHint}
            />

            <Input
              label={t.tenants.leaseEndDate}
              placeholder={t.tenants.datePlaceholder}
              value={leaseEnd}
              onChangeText={setLeaseEnd}
              error={errors.leaseEnd}
              hint={t.tenants.leaseEndHint}
            />
          </Card>

          <Button
            title={t.tenants.addTenant}
            onPress={handleSubmit}
            loading={createTenant.isPending}
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
    paddingBottom: spacing.xxl,
  },
  formCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  rentFromUnit: {
    backgroundColor: colors.gray[800],
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  rentFromUnitLabel: {
    ...typography.caption,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  rentFromUnitValue: {
    ...typography.h2,
    color: '#facc15',
    fontWeight: '700',
  },
  rentFromUnitHint: {
    ...typography.caption,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.md,
  },
});
