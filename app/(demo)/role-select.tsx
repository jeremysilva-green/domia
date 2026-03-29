import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import { useI18n } from '../../src/i18n';
import { UserRole } from '../../src/types';

export default function DemoRoleSelect() {
  const router = useRouter();
  const { t } = useI18n();
  const { signInAsDemo, isLoading } = useAuthStore();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!selected) return;
    setError(null);
    try {
      await signInAsDemo(selected);
      // index.tsx will route to the correct dashboard
      router.replace('/');
    } catch (e: any) {
      setError(e?.message || 'Failed to start demo');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Feather name="chevron-left" size={24} color={colors.yellow} />
      </TouchableOpacity>

      <View style={s.content}>
        <Image
          source={require('../../assets/Domia Logo Crop.png')}
          style={s.logo}
          resizeMode="contain"
        />

        <View style={s.demoBadge}>
          <Text style={s.demoBadgeText}>{t.demo.badge}</Text>
        </View>

        <Text style={s.title}>{t.demo.chooseRole}</Text>

        <View style={s.roleRow}>
          <TouchableOpacity
            style={[s.roleCard, selected === 'owner' && s.roleCardActive]}
            onPress={() => setSelected('owner')}
            activeOpacity={0.85}
          >
            <Feather
              name="home"
              size={32}
              color={selected === 'owner' ? colors.background : colors.text.secondary}
            />
            <Text style={[s.roleText, selected === 'owner' && s.roleTextActive]}>
              {t.demo.ownerDemo}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.roleCard, selected === 'tenant' && s.roleCardActive]}
            onPress={() => setSelected('tenant')}
            activeOpacity={0.85}
          >
            <Feather
              name="user"
              size={32}
              color={selected === 'tenant' ? colors.background : colors.text.secondary}
            />
            <Text style={[s.roleText, selected === 'tenant' && s.roleTextActive]}>
              {t.demo.tenantDemo}
            </Text>
          </TouchableOpacity>
        </View>

        {error && <Text style={s.errorText}>{error}</Text>}
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.startBtn, (!selected || isLoading) && s.startBtnDisabled]}
          onPress={handleStart}
          disabled={!selected || isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={s.startBtnText}>{t.demo.tryDemo}</Text>
              <Feather name="arrow-right" size={18} color={colors.background} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  logo: {
    width: 180,
    height: 80,
  },
  demoBadge: {
    backgroundColor: '#22c55e',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full ?? 999,
    marginTop: -spacing.md,
  },
  demoBadgeText: {
    ...typography.caption,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    ...typography.h3,
    color: colors.text.primary,
    textAlign: 'center',
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  roleCard: {
    flex: 1,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
  },
  roleCardActive: {
    borderColor: colors.yellow,
    backgroundColor: colors.yellow,
  },
  roleText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  roleTextActive: {
    color: colors.background,
  },
  errorText: {
    ...typography.caption,
    color: colors.error.main,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: spacing.lg,
  },
  startBtn: {
    flexDirection: 'row',
    backgroundColor: '#22c55e',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  startBtnDisabled: {
    opacity: 0.4,
  },
  startBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: '#fff',
  },
});
