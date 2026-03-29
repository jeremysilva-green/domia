import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { Button, Input, ConfirmDialog } from '../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import { UserRole } from '../../src/types';
import { useI18n } from '../../src/i18n';

export default function RegisterScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const { role: roleParam } = useLocalSearchParams<{ role?: string }>();
  const preselectedRole: UserRole | null =
    roleParam === 'owner' ? 'owner' : roleParam === 'tenant' ? 'tenant' : null;
  const [role, setRole] = useState<UserRole | null>(preselectedRole);
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
  const [registered, setRegistered] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

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
      setRegistered(true);
    } catch (error: any) {
      setDialog({
        title: t.auth.registerFailed,
        message: error.message || t.common.error,
        onConfirm: () => setDialog(null),
      });
    }
  };

  if (registered) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Image
            source={require('../../assets/Domia Logo Crop.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Feather name="mail" size={64} color={colors.yellow} style={styles.mailIcon} />
          <Text style={styles.successTitle}>{t.auth.accountCreated}</Text>
          <Text style={styles.successMessage}>{t.auth.verifyEmail}</Text>
          <ActivityIndicator color={colors.yellow} style={styles.spinner} />
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
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Image
              source={require('../../assets/Domia Logo Crop.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>{t.auth.createAccount}</Text>

            {!preselectedRole && (
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
            )}

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
      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title || ''}
        message={dialog?.message}
        confirmText="OK"
        hideCancel
        onConfirm={() => dialog?.onConfirm()}
        onCancel={() => setDialog(null)}
      />
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
    width: 180,
    height: 80,
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
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  mailIcon: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  successTitle: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  successMessage: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  spinner: {
    marginTop: spacing.lg,
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
