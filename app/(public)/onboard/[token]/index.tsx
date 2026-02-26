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
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../../../../src/services/supabase';
import { Button, Input, Card } from '../../../../src/components/ui';
import { colors, spacing, typography } from '../../../../src/constants/theme';

export default function TenantOnboardingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
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
  const [completed, setCompleted] = useState(false);

  // Check if token is valid
  const { data: tenant, isLoading: checkingToken } = useQuery({
    queryKey: ['onboarding-token', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select(
          `
          id,
          full_name,
          email,
          phone,
          rent_amount,
          lease_start,
          lease_end,
          onboarding_completed,
          unit:units(
            unit_number,
            property:properties(name, address)
          )
        `
        )
        .eq('onboarding_token', token)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!token,
  });

  const submitOnboarding = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('tenants')
        .update({
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          rent_amount: parseFloat(rentAmount),
          lease_start: leaseStart || null,
          lease_end: leaseEnd || null,
          onboarding_completed: true,
          status: 'active',
        })
        .eq('onboarding_token', token);

      if (error) throw error;
    },
    onSuccess: () => {
      setCompleted(true);
    },
    onError: (error: any) => {
      Alert.alert('Error', error.message || 'Failed to complete registration');
    },
  });

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    if (!rentAmount.trim()) {
      newErrors.rentAmount = 'Monthly rent is required';
    } else if (isNaN(parseFloat(rentAmount)) || parseFloat(rentAmount) <= 0) {
      newErrors.rentAmount = 'Please enter a valid rent amount';
    }

    if (!leaseStart.trim()) {
      newErrors.leaseStart = 'Lease start date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseStart)) {
      newErrors.leaseStart = 'Use format YYYY-MM-DD';
    }

    if (!leaseEnd.trim()) {
      newErrors.leaseEnd = 'Lease end date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(leaseEnd)) {
      newErrors.leaseEnd = 'Use format YYYY-MM-DD';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    submitOnboarding.mutate();
  };

  if (checkingToken) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Verifying link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tenant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Invalid Link</Text>
          <Text style={styles.errorMessage}>
            This registration link is not valid or has expired.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (tenant.onboarding_completed || completed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <View style={styles.successIcon}>
            <Text style={styles.successEmoji}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Registration Complete!</Text>
          <Text style={styles.successMessage}>
            Thank you for registering. Your landlord has been notified and will
            be in touch with you shortly.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
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
          <View style={styles.header}>
            <Text style={styles.logo}>Domus</Text>
            <Text style={styles.title}>Tenant Registration</Text>
            {tenant.unit && (
              <Text style={styles.subtitle}>
                <Text style={styles.propertyName}>
                  {tenant.unit.property?.name}
                </Text>
                {tenant.unit.unit_number && ` - Unit ${tenant.unit.unit_number}`}
              </Text>
            )}
          </View>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <Input
              label="Full Name"
              placeholder="John Doe"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              error={errors.fullName}
            />

            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <Input
              label="Phone"
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              error={errors.phone}
            />
          </Card>

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>Lease Details</Text>

            <Input
              label="Monthly Rent ($)"
              placeholder="1500"
              value={rentAmount}
              onChangeText={setRentAmount}
              keyboardType="decimal-pad"
              error={errors.rentAmount}
            />

            <Input
              label="Lease Start Date"
              placeholder="YYYY-MM-DD"
              value={leaseStart}
              onChangeText={setLeaseStart}
              error={errors.leaseStart}
              hint="Example: 2026-02-01"
            />

            <Input
              label="Lease End Date"
              placeholder="YYYY-MM-DD"
              value={leaseEnd}
              onChangeText={setLeaseEnd}
              error={errors.leaseEnd}
              hint="Example: 2027-01-31"
            />
          </Card>

          <Button
            title="Complete Registration"
            onPress={handleSubmit}
            loading={submitOnboarding.isPending}
            fullWidth
            style={styles.submitButton}
          />

          <Text style={styles.footer}>
            By completing registration, you agree to receive communications from
            your property manager through this app.
          </Text>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  errorTitle: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#facc15',
    letterSpacing: -1,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  propertyName: {
    fontWeight: '600',
    color: '#facc15',
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
  footer: {
    ...typography.caption,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.lg,
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
    color: colors.success.dark,
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
  },
});
