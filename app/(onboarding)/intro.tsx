import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '../../src/i18n';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';

type Role = 'owner' | 'tenant' | null;

// Propietario sees 3 slides then goes to register
// Inquilino skips straight to register from slide 1
const TOTAL_SLIDES = 3;

export default function IntroScreen() {
  const router = useRouter();
  const { t } = useI18n();

  const [slide, setSlide] = useState(1);
  const [selectedRole, setSelectedRole] = useState<Role>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_SLIDES)).current;

  const animateNext = (nextSlide: number) => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(slideAnim, { toValue: -20, duration: 100, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(progressAnim, {
        toValue: nextSlide / TOTAL_SLIDES,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
    setSlide(nextSlide);
  };

  const goToRegister = (role: Role) => {
    router.push(`/(auth)/register?role=${role}`);
  };

  const handleSlide1Continue = () => {
    if (!selectedRole) return;
    if (selectedRole === 'tenant') {
      goToRegister('tenant');
    } else {
      animateNext(2);
    }
  };

  // ── Shared UI ──────────────────────────────────────────────────────────────

  const renderProgressBar = () => (
    <View style={s.progressTrack}>
      <Animated.View
        style={[
          s.progressFill,
          {
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );

  const renderSignInLink = () => (
    <View style={s.signInRow}>
      <Text style={s.signInText}>{t.onboarding.introAlreadyHaveAccount}</Text>
      <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
        <Text style={s.signInLink}> {t.onboarding.introSignIn}</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Slide 1 — Welcome + Role Selection ────────────────────────────────────
  const renderSlide1 = () => (
    <View style={s.slide}>
      <View style={s.logoBlock}>
        <Image
          source={require('../../assets/Domia Logo Crop.png')}
          style={s.logo}
          resizeMode="contain"
        />
        <Text style={s.tagline}>{t.onboarding.introTagline}</Text>
      </View>

      <View style={s.roleBlock}>
        <Text style={s.roleQuestion}>{t.onboarding.introRoleQuestion}</Text>
        <View style={s.roleRow}>
          <TouchableOpacity
            style={[s.roleCard, selectedRole === 'owner' && s.roleCardActive]}
            onPress={() => setSelectedRole('owner')}
            activeOpacity={0.85}
          >
            <Feather name="home" size={28} color={selectedRole === 'owner' ? colors.background : colors.text.secondary} />
            <Text style={[s.roleCardText, selectedRole === 'owner' && s.roleCardTextActive]}>
              {t.onboarding.introOwnerRole}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.roleCard, selectedRole === 'tenant' && s.roleCardActive]}
            onPress={() => setSelectedRole('tenant')}
            activeOpacity={0.85}
          >
            <Feather name="user" size={28} color={selectedRole === 'tenant' ? colors.background : colors.text.secondary} />
            <Text style={[s.roleCardText, selectedRole === 'tenant' && s.roleCardTextActive]}>
              {t.onboarding.introTenantRole}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.primaryBtn, !selectedRole && s.primaryBtnDisabled]}
          onPress={handleSlide1Continue}
          disabled={!selectedRole}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>{t.onboarding.introGetStarted}</Text>
          <Feather name="arrow-right" size={18} color={colors.background} />
        </TouchableOpacity>
        {renderSignInLink()}
      </View>
    </View>
  );

  // ── Slide 2 — Benefit 1 ────────────────────────────────────────────────────
  const renderSlide2 = () => (
    <View style={s.slide}>
      {renderProgressBar()}
      <TouchableOpacity style={s.backBtn} onPress={() => animateNext(1)}>
        <Feather name="chevron-left" size={24} color={colors.yellow} />
      </TouchableOpacity>

      <View style={s.benefitContent}>
        <View style={s.benefitIconWrap}>
          <Feather name="layers" size={52} color={colors.yellow} />
        </View>
        <Text style={s.benefitText}>{t.onboarding.introSlide2}</Text>
      </View>

      <View style={s.footer}>
        <TouchableOpacity style={s.arrowBtn} onPress={() => animateNext(3)} activeOpacity={0.85}>
          <Feather name="arrow-right" size={22} color={colors.background} />
        </TouchableOpacity>
        {renderSignInLink()}
      </View>
    </View>
  );

  // ── Slide 3 — Benefit 2 + CTA ─────────────────────────────────────────────
  const renderSlide3 = () => (
    <View style={s.slide}>
      {renderProgressBar()}
      <TouchableOpacity style={s.backBtn} onPress={() => animateNext(2)}>
        <Feather name="chevron-left" size={24} color={colors.yellow} />
      </TouchableOpacity>

      <View style={s.benefitContent}>
        <View style={s.benefitIconWrap}>
          <Feather name="bell" size={52} color={colors.yellow} />
        </View>
        <Text style={s.benefitText}>{t.onboarding.introSlide3}</Text>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.primaryBtn}
          onPress={() => goToRegister('owner')}
          activeOpacity={0.85}
        >
          <Text style={s.primaryBtnText}>{t.onboarding.introCreateAccount}</Text>
          <Feather name="arrow-right" size={18} color={colors.background} />
        </TouchableOpacity>
        {renderSignInLink()}
      </View>
    </View>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ImageBackground
      source={require('../../assets/onboarding-bg.jpg')}
      style={s.bgImage}
      resizeMode="cover"
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.container} edges={['top', 'bottom']}>
          <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: slideAnim }] }]}>
            {slide === 1 && renderSlide1()}
            {slide === 2 && renderSlide2()}
            {slide === 3 && renderSlide3()}
          </Animated.View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bgImage: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,15,20,0.82)' },
  container: { flex: 1 },

  slide: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },

  // Progress bar
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.yellow,
    borderRadius: 2,
  },

  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },

  // Slide 1
  logoBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 200,
    height: 90,
  },
  tagline: {
    ...typography.h3,
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 28,
  },

  roleBlock: {
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  roleQuestion: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleCard: {
    flex: 1,
    paddingVertical: spacing.lg,
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
  roleCardText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  roleCardTextActive: {
    color: colors.background,
  },

  // Benefit slides
  benefitContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  benefitIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(250,204,21,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    ...typography.h2,
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 34,
  },

  // Footer
  footer: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: colors.yellow,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryBtnDisabled: {
    opacity: 0.4,
  },
  primaryBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: colors.background,
  },
  arrowBtn: {
    alignSelf: 'flex-end',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.yellow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: {
    ...typography.body,
    color: colors.text.secondary,
  },
  signInLink: {
    ...typography.body,
    color: colors.yellow,
    fontWeight: '600',
  },
});
