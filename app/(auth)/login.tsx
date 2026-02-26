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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useI18n } from '../../src/i18n';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import { UserRole } from '../../src/types';

export default function LoginScreen() {
  const [role, setRole] = useState<UserRole>('owner');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const { signIn, isLoading } = useAuthStore();
  const { t, language } = useI18n();

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email.trim()) {
      newErrors.email = language === 'es' ? 'El correo es requerido' : 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = language === 'es' ? 'Ingresa un correo válido' : 'Please enter a valid email';
    }

    if (!password) {
      newErrors.password = language === 'es' ? 'La contraseña es requerida' : 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    try {
      await signIn(email.trim(), password);
    } catch (error: any) {
      Alert.alert(t.auth.loginFailed, error.message || 'An error occurred');
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
            <Image
              source={require('../../assets/Domia Logo Crop.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>
              {language === 'es'
                ? 'Sabe quién pagó, quién no y qué está roto — al instante.'
                : "Know who paid, who didn't, and what's broken — instantly."}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  role === 'owner' && styles.roleTabActive,
                ]}
                onPress={() => setRole('owner')}
              >
                <Feather
                  name="home"
                  size={18}
                  color={role === 'owner' ? colors.background : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.roleTabText,
                    role === 'owner' && styles.roleTabTextActive,
                  ]}
                >
                  {t.auth.owner}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleTab,
                  role === 'tenant' && styles.roleTabActive,
                ]}
                onPress={() => setRole('tenant')}
              >
                <Feather
                  name="user"
                  size={18}
                  color={role === 'tenant' ? colors.background : colors.text.secondary}
                />
                <Text
                  style={[
                    styles.roleTabText,
                    role === 'tenant' && styles.roleTabTextActive,
                  ]}
                >
                  {t.auth.tenant}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.title}>{t.auth.welcomeBack}</Text>
            <Text style={styles.subtitle}>
              {role === 'owner'
                ? t.auth.ownerSubtitle
                : t.auth.tenantSubtitle}
            </Text>

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
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={errors.password}
            />

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>{t.auth.forgotPassword}</Text>
              </TouchableOpacity>
            </Link>

            <Button
              title={t.auth.login}
              onPress={handleLogin}
              loading={isLoading}
              fullWidth
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t.auth.noAccount}</Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}> {t.auth.register}</Text>
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    width: 180,
    height: 80,
  },
  tagline: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  form: {
    flex: 1,
  },
  roleSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  roleTabActive: {
    backgroundColor: '#facc15',
  },
  roleTabText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  roleTabTextActive: {
    color: colors.background,
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: spacing.lg,
    marginTop: -spacing.sm,
  },
  forgotPasswordText: {
    ...typography.bodySmall,
    color: '#facc15',
    fontWeight: '500',
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
