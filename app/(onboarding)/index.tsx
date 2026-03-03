import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Alert,
  Image,
  ImageBackground,
  PanResponder,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getLocales } from 'expo-localization';
import { useAuthStore } from '../../src/stores/authStore';
import { useI18n } from '../../src/i18n';
import { colors, spacing, typography, borderRadius } from '../../src/constants/theme';
import {
  useSubscriptionStore,
  PLAN_PRODUCT_IDS,
  PLAN_PRICES,
  PlanType,
} from '../../src/stores/subscriptionStore';

const TOTAL_STEPS = 8;

type GoalKey =
  | 'moreTime'
  | 'moreVisibility'
  | 'whoIsPaying'
  | 'moreOrganized'
  | 'financialClarity'
  | 'lessStress';

const GOAL_SHORT_KEYS: Record<GoalKey, string> = {
  moreTime: 'goalMoreTime',
  moreVisibility: 'goalVisibility',
  whoIsPaying: 'goalPayments',
  moreOrganized: 'goalOrganized',
  financialClarity: 'goalClarity',
  lessStress: 'goalLessStress',
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, setLanguage } = useI18n();
  const { owner, completeOnboarding, fetchOwnerProfile } = useAuthStore();
  const { initConnection, purchasePlan, isPurchasing } = useSubscriptionStore();

  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState(owner?.full_name || '');
  const [selectedPlan, setSelectedPlan] = useState<PlanType | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<GoalKey[]>([]);

  // Hold animation for commitment screen
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Slide transition
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Progress bar
  const progressAnim = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  // Detect device language on mount
  useEffect(() => {
    try {
      const locale = getLocales()[0];
      if (locale?.languageCode === 'es') {
        setLanguage('es');
      }
    } catch {}
  }, []);

  // Init IAP connection
  useEffect(() => {
    initConnection();
  }, []);

  const primaryGoal = selectedGoals[0];
  const primaryGoalShort =
    primaryGoal ? (t.onboarding as any)[GOAL_SHORT_KEYS[primaryGoal]] : '';

  const goNext = () => {
    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(slideAnim, {
          toValue: -20,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(progressAnim, {
        toValue: nextStep / TOTAL_STEPS,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();
    setStep(nextStep);
  };

  const goBack = () => {
    if (step === 1) return;
    const prevStep = step - 1;
    Animated.timing(progressAnim, {
      toValue: prevStep / TOTAL_STEPS,
      duration: 300,
      useNativeDriver: false,
    }).start();
    setStep(prevStep);
  };

  // ── Commitment hold mechanic ─────────────────────────────────────────────
  const startHold = () => {
    if (committed) return;
    setIsHolding(true);
    holdAnimRef.current = Animated.timing(holdProgress, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    });
    holdAnimRef.current.start(({ finished }) => {
      if (finished) {
        setCommitted(true);
        setIsHolding(false);
        holdTimerRef.current = setTimeout(() => {
          goNext();
        }, 600);
      }
    });
  };

  const stopHold = () => {
    if (committed) return;
    setIsHolding(false);
    holdAnimRef.current?.stop();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // ── Purchase handler ─────────────────────────────────────────────────────
  const handlePurchase = async () => {
    if (!selectedPlan) return;

    purchasePlan(
      selectedPlan,
      async () => {
        // On success — save to DB and go to app
        try {
          await completeOnboarding({
            displayName: displayName.trim() || owner?.full_name || '',
            planType: selectedPlan,
            productId: PLAN_PRODUCT_IDS[selectedPlan],
          });
          router.replace('/(app)/(tabs)');
        } catch (e: any) {
          Alert.alert('Error', e.message);
        }
      },
      (msg) => {
        Alert.alert(t.onboarding.purchaseError, msg);
      }
    );
  };

  // ── Shared layout helpers ────────────────────────────────────────────────
  const renderHeader = (showBack = true, showSkip = false, onSkip?: () => void) => (
    <View style={s.header}>
      <TouchableOpacity
        style={s.backBtn}
        onPress={goBack}
        disabled={!showBack || step === 1}
      >
        {showBack && step > 1 ? (
          <Feather name="chevron-left" size={24} color={colors.yellow} />
        ) : (
          <View style={{ width: 24 }} />
        )}
      </TouchableOpacity>
      <Text style={s.stepLabel}>
        {t.onboarding.step} {step} {t.onboarding.of} {TOTAL_STEPS}
      </Text>
      {showSkip ? (
        <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
          <Text style={s.skipText}>{t.onboarding.skip}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 48 }} />
      )}
    </View>
  );

  const renderArrowButton = (onPress: () => void, disabled = false) => (
    <TouchableOpacity
      style={[s.arrowBtn, disabled && s.arrowBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Feather name="arrow-right" size={22} color={disabled ? colors.text.disabled : colors.background} />
    </TouchableOpacity>
  );

  // ── Step renderers ───────────────────────────────────────────────────────

  // STEP 1 — Welcome
  const renderStep1 = () => (
    <View style={s.fullScreen}>
      <View style={s.welcomeContent}>
        <Image
          source={require('../../assets/Domia Logo Crop.png')}
          style={s.welcomeLogo}
          resizeMode="contain"
        />
        <Text style={s.welcomeTitle}>{t.onboarding.welcomeTitle}</Text>
        <Text style={s.welcomeSubtitle}>{t.onboarding.welcomeSubtitle}</Text>
      </View>
      <View style={s.welcomeFooter}>
        <TouchableOpacity style={s.getStartedBtn} onPress={goNext} activeOpacity={0.85}>
          <Text style={s.getStartedText}>{t.onboarding.getStarted}</Text>
          <Feather name="arrow-right" size={18} color={colors.background} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // STEP 2 — Name
  const renderStep2 = () => (
    <View style={s.stepContainer}>
      {renderHeader(true, false)}
      <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={s.questionText}>{t.onboarding.whatIsYourName}</Text>
        <TextInput
          style={s.nameInput}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t.onboarding.namePlaceholder}
          placeholderTextColor={colors.text.disabled}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
        />
      </ScrollView>
      <View style={s.bottomNav}>
        <View style={{ flex: 1 }} />
        {renderArrowButton(goNext, !displayName.trim())}
      </View>
    </View>
  );

  // STEP 3 — Plan selection
  const plans: { key: PlanType; label: string }[] = [
    { key: '1-10', label: t.onboarding.units1to10 },
    { key: '10-30', label: t.onboarding.units10to30 },
    { key: '30-50', label: t.onboarding.units30to50 },
  ];

  const renderStep3 = () => (
    <View style={s.stepContainer}>
      {renderHeader()}
      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={s.questionText}>{t.onboarding.howManyUnits}</Text>
        <View style={s.pillList}>
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.key;
            return (
              <TouchableOpacity
                key={plan.key}
                style={[s.planPill, isSelected && s.pillSelected]}
                onPress={() => setSelectedPlan(plan.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.planPillLabel, isSelected && s.pillTextSelected]}>
                  {plan.label}
                </Text>
                <Text style={[s.planPillPrice, isSelected && s.pillTextSelected]}>
                  {PLAN_PRICES[plan.key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.bottomNav}>
        <View style={{ flex: 1 }} />
        {renderArrowButton(goNext, !selectedPlan)}
      </View>
    </View>
  );

  // STEP 4 — Goals
  const goals: { key: GoalKey; label: string }[] = [
    { key: 'moreTime', label: t.onboarding.moreTime },
    { key: 'moreVisibility', label: t.onboarding.moreVisibility },
    { key: 'whoIsPaying', label: t.onboarding.whoIsPaying },
    { key: 'moreOrganized', label: t.onboarding.moreOrganized },
    { key: 'financialClarity', label: t.onboarding.financialClarity },
    { key: 'lessStress', label: t.onboarding.lessStress },
  ];

  const toggleGoal = (key: GoalKey) => {
    setSelectedGoals((prev) =>
      prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]
    );
  };

  const renderStep4 = () => (
    <View style={s.stepContainer}>
      {renderHeader()}
      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={s.questionText}>{t.onboarding.whatToAchieve}</Text>
        <View style={s.pillList}>
          {goals.map((goal) => {
            const isSelected = selectedGoals.includes(goal.key);
            return (
              <TouchableOpacity
                key={goal.key}
                style={[s.pill, isSelected && s.pillSelected]}
                onPress={() => toggleGoal(goal.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.pillText, isSelected && s.pillTextSelected]}>
                  {goal.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={s.bottomNav}>
        <View style={{ flex: 1 }} />
        {renderArrowButton(goNext, selectedGoals.length === 0)}
      </View>
    </View>
  );

  // STEP 5 — Commitment
  const ringScale = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });
  const ringOpacity = holdProgress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 1],
  });
  const ringColor = holdProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(250,204,21,0.2)', 'rgba(250,204,21,0.6)'],
  });

  const commitText = t.onboarding.commitmentText
    .replace('{name}', displayName || owner?.full_name || '')
    .replace('{goal}', primaryGoalShort);

  const renderStep5 = () => (
    <View style={s.stepContainer}>
      {renderHeader(true, false)}
      <View style={[s.scrollContent, { flex: 1, justifyContent: 'center' }]}>
        <Text style={s.commitText}>{commitText}</Text>

        <View style={s.logoHoldContainer}>
          {/* Glowing rings */}
          <Animated.View
            style={[
              s.holdRing,
              s.holdRingOuter,
              { transform: [{ scale: ringScale }], opacity: ringOpacity, borderColor: ringColor as any },
            ]}
          />
          <Animated.View
            style={[
              s.holdRing,
              s.holdRingInner,
              { opacity: ringOpacity, borderColor: ringColor as any },
            ]}
          />
          {/* Fingerprint icon */}
          <View style={s.fingerprintContainer}>
            <Feather name="activity" size={48} color={committed ? colors.yellow : colors.text.disabled} />
          </View>
          {/* Hold button overlay */}
          <TouchableOpacity
            style={s.holdTouchArea}
            onPressIn={startHold}
            onPressOut={stopHold}
            activeOpacity={1}
          >
            <Image
              source={require('../../assets/Domia Logo Crop.png')}
              style={s.holdLogo}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        <Text style={s.holdHintText}>
          {committed
            ? t.onboarding.committed
            : isHolding
            ? t.onboarding.holdToCommit
            : t.onboarding.tapAndHold}
        </Text>
      </View>
    </View>
  );

  // STEP 6 — Trial intro
  const trialSubtitle = t.onboarding.trialSubtitle.replace('{goal}', primaryGoalShort);

  const renderStep6 = () => (
    <View style={s.stepContainer}>
      {renderHeader()}
      <ScrollView contentContainerStyle={[s.scrollContent, s.centerContent]}>
        <View style={s.trialIconWrap}>
          <Feather name="star" size={48} color={colors.yellow} />
        </View>
        <Text style={s.questionText}>{t.onboarding.trialTitle}</Text>
        <Text style={s.trialSubtitle}>{trialSubtitle}</Text>
        <View style={s.featureList}>
          {[
            t.onboarding.trialFeature1,
            t.onboarding.trialFeature2,
            t.onboarding.trialFeature3,
          ].map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Feather name="check-circle" size={18} color={colors.yellow} />
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={s.bottomNav}>
        <View style={{ flex: 1 }} />
        {renderArrowButton(goNext)}
      </View>
    </View>
  );

  // STEP 7 — Reminder
  const renderStep7 = () => (
    <View style={s.stepContainer}>
      {renderHeader(true, false)}
      <View style={[s.scrollContent, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
        <View style={s.reminderIconWrap}>
          <Feather name="bell" size={52} color={colors.yellow} />
        </View>
        <Text style={[s.questionText, { textAlign: 'center' }]}>
          {t.onboarding.reminderTitle}
        </Text>
        <Text style={s.reminderSubtitle}>{t.onboarding.reminderSubtitle}</Text>
      </View>
      <View style={s.bottomNav}>
        <View style={{ flex: 1 }} />
        {renderArrowButton(goNext)}
      </View>
    </View>
  );

  // STEP 8 — Paywall
  const renderStep8 = () => (
    <View style={s.stepContainer}>
      {renderHeader(true, false)}
      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={s.questionText}>{t.onboarding.yourPlan}</Text>
        <View style={s.pillList}>
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.key;
            return (
              <TouchableOpacity
                key={plan.key}
                style={[s.planPill, isSelected && s.pillSelected]}
                onPress={() => setSelectedPlan(plan.key)}
                activeOpacity={0.8}
              >
                <Text style={[s.planPillLabel, isSelected && s.pillTextSelected]}>
                  {plan.label}
                </Text>
                <Text style={[s.planPillPrice, isSelected && s.pillTextSelected]}>
                  {PLAN_PRICES[plan.key]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.paywallFeatures}>
          {[
            t.onboarding.trialFeature1,
            t.onboarding.trialFeature2,
            t.onboarding.trialFeature3,
          ].map((f, i) => (
            <View key={i} style={s.featureRow}>
              <Feather name="check-circle" size={16} color={colors.yellow} />
              <Text style={s.featureText}>{f}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.ctaButton, (!selectedPlan || isPurchasing) && s.ctaButtonDisabled]}
          onPress={handlePurchase}
          disabled={!selectedPlan || isPurchasing}
          activeOpacity={0.85}
        >
          <Text style={s.ctaButtonText}>
            {isPurchasing ? t.onboarding.processingPurchase : t.onboarding.startFreeTrialCta}
          </Text>
        </TouchableOpacity>

        <Text style={s.disclaimer}>{t.onboarding.trialDisclaimer}</Text>
      </ScrollView>
    </View>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ImageBackground
      source={require('../../assets/onboarding-bg.jpg')}
      style={s.bgImage}
      resizeMode="cover"
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.container} edges={['top', 'bottom']}>
          {step > 1 && (
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
          )}
          <Animated.View style={[{ flex: 1 }, { transform: [{ translateX: slideAnim }] }]}>
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
            {step === 5 && renderStep5()}
            {step === 6 && renderStep6()}
            {step === 7 && renderStep7()}
            {step === 8 && renderStep8()}
          </Animated.View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  bgImage: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fullScreen: {
    flex: 1,
  },

  // ── Progress bar ──
  progressTrack: {
    height: 3,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.yellow,
    borderRadius: 2,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  stepLabel: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  skipBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  skipText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
  },

  // ── Step layout ──
  stepContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  centerContent: {
    alignItems: 'center',
  },

  // ── Question text ──
  questionText: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 38,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },

  // ── Pills ──
  pillList: {
    gap: spacing.sm,
  },
  pill: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: colors.yellow,
  },
  pillText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  pillTextSelected: {
    color: colors.background,
  },

  // ── Plan pills (two-column) ──
  planPill: {
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planPillLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text.primary,
  },
  planPillPrice: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text.secondary,
  },

  // ── Bottom nav ──
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  arrowBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: {
    backgroundColor: colors.surface,
  },

  // ── Welcome step ──
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  welcomeLogo: {
    width: 200,
    height: 70,
    marginBottom: spacing.xl,
  },
  welcomeTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  welcomeSubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  welcomeFooter: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.yellow,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  getStartedText: {
    ...typography.button,
    color: colors.background,
  },

  // ── Name input ──
  nameInput: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text.primary,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.yellow,
    marginBottom: spacing.xl,
  },

  // ── Commitment ──
  commitText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    lineHeight: 32,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  logoHoldContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  holdRing: {
    position: 'absolute',
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  holdRingOuter: {
    width: 180,
    height: 180,
  },
  holdRingInner: {
    width: 140,
    height: 140,
  },
  fingerprintContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.3,
  },
  holdTouchArea: {
    width: 110,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdLogo: {
    width: 110,
    height: 50,
  },
  holdHintText: {
    ...typography.bodySmall,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  // ── Trial ──
  trialIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(250,204,21,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  trialSubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  featureList: {
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  featureText: {
    ...typography.body,
    color: colors.text.primary,
  },

  // ── Reminder ──
  reminderIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(250,204,21,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  reminderSubtitle: {
    ...typography.body,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // ── Paywall ──
  paywallFeatures: {
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  ctaButton: {
    backgroundColor: colors.yellow,
    borderRadius: borderRadius.full,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaButtonDisabled: {
    backgroundColor: colors.surface,
  },
  ctaButtonText: {
    ...typography.button,
    color: colors.background,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.text.disabled,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
});
