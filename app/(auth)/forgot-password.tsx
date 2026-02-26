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
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { Button, Input } from '../../src/components/ui';
import { colors, spacing, typography } from '../../src/constants/theme';
import { useI18n } from '../../src/i18n';

export default function ForgotPasswordScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const { resetPassword, isLoading } = useAuthStore();

  const validate = () => {
    if (!email.trim()) {
      setError(t.tenants.emailRequired);
      return false;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError(t.tenants.emailInvalid);
      return false;
    }
    setError('');
    return true;
  };

  const handleResetPassword = async () => {
    if (!validate()) return;

    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (error: any) {
      Alert.alert(t.common.error, error.message || t.common.error);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.successEmoji}>...</Text>
          </View>
          <Text style={styles.successTitle}>{t.auth.checkEmail}</Text>
          <Text style={styles.successMessage}>
            {t.auth.resetInstructionsSent} {email}
          </Text>
          <Button
            title={t.auth.backToSignIn}
            onPress={() => router.replace('/(auth)/login')}
            fullWidth
            style={styles.backButton}
          />
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
          <TouchableOpacity
            style={styles.backNav}
            onPress={() => router.back()}
          >
            <Text style={styles.backNavText}>... {t.common.back}</Text>
          </TouchableOpacity>

          <View style={styles.form}>
            <Text style={styles.title}>{t.auth.resetPassword}</Text>
            <Text style={styles.subtitle}>
              {t.auth.resetPasswordSubtitle}
            </Text>

            <Input
              label={t.auth.email}
              placeholder={t.auth.emailPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              error={error}
            />

            <Button
              title={t.auth.sendResetLink}
              onPress={handleResetPassword}
              loading={isLoading}
              fullWidth
            />
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
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  backNav: {
    marginBottom: spacing.xl,
  },
  backNavText: {
    ...typography.body,
    color: '#facc15',
    fontWeight: '500',
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
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
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
    marginBottom: spacing.xl,
  },
  backButton: {
    marginTop: spacing.md,
  },
});
