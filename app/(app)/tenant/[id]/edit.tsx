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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../src/services/supabase';
import { Button, Input, Card } from '../../../../src/components/ui';
import { colors, spacing, typography } from '../../../../src/constants/theme';
import { useI18n } from '../../../../src/i18n';
import { prefillPhone } from '../../../../src/utils/phoneCountryCode';

// Convert YYYY-MM-DD to display format based on language
// English: MM/DD/YYYY, Spanish: DD/MM/YYYY
const formatDateForDisplay = (dateStr: string, isSpanish: boolean): string => {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return isSpanish ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
  }
  return dateStr;
};

// Convert display format to YYYY-MM-DD for database
// English: MM/DD/YYYY -> YYYY-MM-DD, Spanish: DD/MM/YYYY -> YYYY-MM-DD
const formatDateForDatabase = (dateStr: string, isSpanish: boolean): string => {
  if (!dateStr) return '';
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, first, second, year] = match;
    // Spanish: DD/MM/YYYY, English: MM/DD/YYYY
    return isSpanish ? `${year}-${second}-${first}` : `${year}-${first}-${second}`;
  }
  return dateStr;
};

// Auto-format date input with auto-advancing slashes
const formatDateInput = (text: string): string => {
  // Remove non-numeric characters
  const cleaned = text.replace(/[^\d]/g, '');

  // Build formatted string with auto-advancing slashes
  let formatted = '';
  for (let i = 0; i < cleaned.length && i < 8; i++) {
    if (i === 2 || i === 4) {
      formatted += '/';
    }
    formatted += cleaned[i];
  }

  return formatted;
};

export default function EditTenantScreen() {
  const { t, language } = useI18n();
  const isSpanish = language === 'es';
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(prefillPhone());
  const [rentAmount, setRentAmount] = useState('');
  const [leaseStart, setLeaseStart] = useState('');
  const [leaseEnd, setLeaseEnd] = useState('');
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    rentAmount?: string;
    leaseStart?: string;
    leaseEnd?: string;
  }>({});

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-edit', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (tenant) {
      setFullName(tenant.full_name || '');
      setEmail(tenant.email || '');
      setPhone(prefillPhone(tenant.phone));
      setRentAmount(tenant.rent_amount?.toString() || '');
      setLeaseStart(formatDateForDisplay(tenant.lease_start || '', isSpanish));
      setLeaseEnd(formatDateForDisplay(tenant.lease_end || '', isSpanish));
    }
  }, [tenant, isSpanish]);

  const updateTenant = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase
        .from('tenants') as any)
        .update({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          rent_amount: parseFloat(rentAmount),
          lease_start: formatDateForDatabase(leaseStart, isSpanish) || null,
          lease_end: formatDateForDatabase(leaseEnd, isSpanish) || null,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      router.back();
    },
    onError: (error: any) => {
      Alert.alert(t.common.error, error.message || t.tenants.updateTenantFailed);
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

    if (!rentAmount.trim()) {
      newErrors.rentAmount = t.tenants.monthlyRentRequired;
    } else if (isNaN(parseFloat(rentAmount)) || parseFloat(rentAmount) <= 0) {
      newErrors.rentAmount = t.tenants.rentInvalid;
    }

    // Both formats use DD/MM/YYYY pattern (just different order interpretation)
    if (leaseStart && !/^\d{2}\/\d{2}\/\d{4}$/.test(leaseStart)) {
      newErrors.leaseStart = isSpanish ? t.tenants.dateFormatError : t.tenants.dateFormatErrorUS;
    }

    if (leaseEnd && !/^\d{2}\/\d{2}\/\d{4}$/.test(leaseEnd)) {
      newErrors.leaseEnd = isSpanish ? t.tenants.dateFormatError : t.tenants.dateFormatErrorUS;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    updateTenant.mutate();
  };

  const handleCancel = () => {
    router.back();
  };

  const handleLeaseStartChange = (text: string) => {
    setLeaseStart(formatDateInput(text));
  };

  const handleLeaseEndChange = (text: string) => {
    setLeaseEnd(formatDateInput(text));
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={styles.cancelButton}>{t.common.cancel}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t.tenants.editTenant}</Text>
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

            <Input
              label={t.tenants.monthlyRentUSD}
              placeholder="1500"
              value={rentAmount}
              onChangeText={setRentAmount}
              keyboardType="decimal-pad"
              error={errors.rentAmount}
            />

            <Input
              label={t.tenants.leaseStartDate}
              placeholder={isSpanish ? t.tenants.datePlaceholder : t.tenants.datePlaceholderUS}
              value={leaseStart}
              onChangeText={handleLeaseStartChange}
              error={errors.leaseStart}
              hint={isSpanish ? t.tenants.leaseStartHint : t.tenants.leaseStartHintUS}
              keyboardType="number-pad"
              maxLength={10}
            />

            <Input
              label={t.tenants.leaseEndDate}
              placeholder={isSpanish ? t.tenants.datePlaceholder : t.tenants.datePlaceholderUS}
              value={leaseEnd}
              onChangeText={handleLeaseEndChange}
              error={errors.leaseEnd}
              hint={isSpanish ? t.tenants.leaseEndHint : t.tenants.leaseEndHintUS}
              keyboardType="number-pad"
              maxLength={10}
            />
          </Card>

          <Button
            title={t.tenants.saveChanges}
            onPress={handleSubmit}
            loading={updateTenant.isPending}
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
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
  submitButton: {
    marginTop: spacing.md,
  },
});
