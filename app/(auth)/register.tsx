import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import { UserRole } from '../../src/types';
import { useI18n } from '../../src/i18n';

export default function RegisterScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    role?: string;
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const { signUp, isLoading } = useAuthStore();

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!role) {
      newErrors.role = t.auth.selectAccountType;
    }

    if (!fullName.trim()) {
      newErrors.fullName = t.tenants.fullNameRequired;
    }

    if (!email.trim()) {
      newErrors.email = t.tenants.emailRequired;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = t.tenants.emailInvalid;
    }

    if (!password) {
      newErrors.password = t.auth.passwordRequired;
    } else if (password.length < 6) {
      newErrors.password = t.auth.passwordMinLength;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = t.auth.passwordsNoMatch;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validate() || !role) return;

    try {
      await signUp(email.trim(), password, fullName.trim(), role);
      Alert.alert(
        t.auth.accountCreated,
        t.auth.verifyEmail,
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    } catch (error: any) {
      Alert.alert(t.auth.registerFailed, error.message || t.common.error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.logo}>Domus</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>{t.auth.createAccount}</Text>
            <Text style={styles.subtitle}>
              {t.auth.joinSubtitle}
            </Text>

            <View style={styles.roleSection}>
              <Text style={styles.roleLabel}>{t.auth.iAm}</Text>
              <View style={styles.roleOptions}>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === 'owner' && styles.roleButtonActive,
                  ]}
                  onPress={() => setRole('owner')}
                >
                  <Feather
                    name="home"
                    size={24}
                    color={role === 'owner' ? colors.yellow : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === 'owner' && styles.roleButtonTextActive,
                    ]}
                  >
                    {t.auth.propertyOwner}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {t.auth.managePropertiesDesc}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    role === 'tenant' && styles.roleButtonActive,
                  ]}
                  onPress={() => setRole('tenant')}
                >
                  <Feather
                    name="user"
                    size={24}
                    color={role === 'tenant' ? colors.yellow : colors.text.secondary}
                  />
                  <Text
                    style={[
                      styles.roleButtonText,
                      role === 'tenant' && styles.roleButtonTextActive,
                    ]}
                  >
                    {t.auth.tenant}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {t.auth.connectWithLandlordDesc}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.role && <Text style={styles.errorText}>{errors.role}</Text>}
            </View>

            <Input
              label={t.auth.fullName}
              placeholder={t.auth.namePlaceholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              error={errors.fullName}
            />

            <Input
              label={t.auth.email}
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.email}
            />

            <Input
              label={t.auth.password}
              placeholder={t.auth.createPasswordPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
              hint={t.auth.passwordHint}
            />

            <Input
              label={t.auth.confirmPassword}
              placeholder={t.auth.confirmPasswordPlaceholder}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              error={errors.confirmPassword}
            />

            <View style={styles.buttonContainer}>
              <Button
                title={t.auth.createAccount}
                onPress={handleRegister}
                loading={isLoading}
                fullWidth
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.auth.hasAccount}</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}> {t.auth.login}</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    fontSize: 36,
    fontWeight: '700',
    color: '#facc15',
    letterSpacing: -1,
  },
  form: {
    flex: 1,
  },
  title: {
    ...typography.h2,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
  },
  roleSection: {
    marginBottom: spacing.lg,
  },
  roleLabel: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  roleOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  roleButtonActive: {
    borderColor: '#facc15',
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
  },
  roleButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  roleButtonTextActive: {
    color: '#facc15',
  },
  roleDescription: {
    ...typography.caption,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.error.main,
    marginTop: spacing.xs,
  },
  buttonContainer: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  footerLink: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '600',
  },
});
