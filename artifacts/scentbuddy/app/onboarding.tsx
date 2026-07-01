import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Drop,
  Users,
  ChartBar,
  Sparkle,
  ArrowRight,
  Scan,
  Check,
  Crown,
  Star,
  AppleLogo,
  Eye,
  EyeSlash,
  WarningCircle,
  CaretLeft,
  MapPin,
  TrendUp,
  ArrowDown,
} from 'phosphor-react-native';
import { AntDesign } from '@expo/vector-icons';
import {
  QUIZ_FLOW,
  QUESTION_BY_KEY,
  QUIZ_QUESTION_COUNT,
  QuizQuestionType,
  ONBOARDING_QUIZ_KEY,
  QuizResults,
  STARTER_COLLECTION_KEY,
  StarterPick,
} from '@/constants/quiz';
import { computeArchetype, ScentArchetype } from '@/lib/scent-archetype';
import { searchFragrances, forceHttps, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { getPendingReferralCode } from '@/lib/referralLink';

interface FragranceMatch {
  name: string;
  brand: string;
  concentration?: string | null;
  topNotes?: string[];
  heartNotes?: string[];
  baseNotes?: string[];
  imageUrl?: string | null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

const BG = '#0a0806';
const GOLD = '#c49a6c';
const GOLD_LIGHT = '#e3c39a';
const TEXT = '#f6f1e9';
const SUBTEXT = 'rgba(246,241,233,0.55)';
const FAINT = 'rgba(246,241,233,0.38)';
const CARD = 'rgba(255,255,255,0.05)';
const CARD_BORDER = 'rgba(255,255,255,0.09)';
const QUIZ_ACCENT = GOLD;

interface Feature {
  title: string;
  subtitle: string;
  icon: React.ElementType;
}

const FEATURES: Feature[] = [
  {
    title: 'Your collection,\nbeautifully kept',
    subtitle: 'Catalog every bottle you own — notes, seasons, and occasions, all in one elegant place.',
    icon: Drop,
  },
  {
    title: 'Scan any bottle,\nknow it instantly',
    subtitle: 'Point your camera at a barcode or label and identify any fragrance from 74K+ scents in seconds.',
    icon: Scan,
  },
  {
    title: 'See what the\nworld is wearing',
    subtitle: 'Follow fellow enthusiasts, share your daily scent, and discover bottles from real collections.',
    icon: Users,
  },
  {
    title: 'Insights that\nreveal your taste',
    subtitle: 'Your Scent DNA, seasonal trends, streaks, and side-by-side comparisons — personalized to you.',
    icon: ChartBar,
  },
  {
    title: 'Go Pro, unlock\neverything',
    subtitle: 'Unlimited collection, AI-matched picks, advanced stats, and twin finder. Less than a coffee a month.',
    icon: Crown,
  },
];

interface Testimonial {
  quote: string;
  name: string;
  handle: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    quote: 'Finally an app that actually understands fragrance lovers. My whole collection lives here now.',
    name: 'Maya R.',
    handle: 'collector',
  },
  {
    quote: 'The scan feature is magic. I rebuilt my entire shelf in one evening.',
    name: 'Daniel K.',
    handle: 'enthusiast',
  },
  {
    quote: 'My Scent DNA was scarily accurate. The recommendations are spot on.',
    name: 'Priya S.',
    handle: 'niche fan',
  },
];

interface SolutionRow {
  icon: React.ElementType;
  title: string;
  desc: string;
}

// Map the user's stated frustrations + goals to the concrete features that
// close each one. Keeps the "how the app closes your gap" screen personal
// rather than a generic feature tour.
function buildSolutions(struggles: string[], goals: string[]): SolutionRow[] {
  const rows: SolutionRow[] = [];
  const add = (r: SolutionRow) => {
    if (rows.length < 4 && !rows.some((x) => x.title === r.title)) rows.push(r);
  };
  const s = (v: string) => struggles.includes(v);
  const g = (v: string) => goals.includes(v);

  if (s('I blind-buy and regret it') || g('Stop wasting money on bad buys'))
    add({ icon: Scan, title: 'AI scent matching', desc: "Get matched to bottles you'll love before you spend a cent." });
  if (s("I can't find my signature") || g('Find my signature scent'))
    add({ icon: Drop, title: 'Scent DNA', desc: "Pinpoint the profile that's unmistakably you." });
  if (s('I forget what I own') || g('Track & remember what I own'))
    add({ icon: ChartBar, title: 'Collection tracker', desc: 'Every bottle, note and memory in one place.' });
  if (s('Too many options, I feel lost'))
    add({ icon: Sparkle, title: 'Curated For You', desc: 'A personal shortlist instead of endless choices.' });
  if (s('I wear the same one on repeat') || g('Build a smart, curated collection'))
    add({ icon: ChartBar, title: 'Scent wardrobe', desc: 'Build a rotation for every season and moment.' });
  if (s("I don't know what suits me"))
    add({ icon: Users, title: 'Twin Finder', desc: 'See what people with your exact taste wear.' });
  if (g('Get more compliments'))
    add({ icon: Star, title: 'Compliment-getters', desc: 'Surface crowd-pleasers proven to turn heads.' });
  if (g('Discover niche hidden gems'))
    add({ icon: Crown, title: 'Hidden gems', desc: "Go beyond mainstream into niche you'd never find." });

  if (rows.length === 0) {
    add({ icon: Drop, title: 'Scent DNA', desc: 'Understand your taste in one clear profile.' });
    add({ icon: Scan, title: 'AI scent matching', desc: 'Personalized picks that actually fit you.' });
    add({ icon: ChartBar, title: 'Collection tracker', desc: 'Keep your whole wardrobe organized.' });
  }
  return rows;
}

type Phase = 'features' | 'social' | 'quiz' | 'result' | 'signin';
type AuthMode = 'signup' | 'login';

interface OnboardingScreenProps {
  onComplete?: () => void;
}

function Backdrop() {
  return (
    <>
      <LinearGradient colors={[BG, '#150d06', BG]} style={StyleSheet.absoluteFill} />
      <View style={styles.glowWrap} pointerEvents="none">
        <View style={styles.glowOuter} />
        <View style={styles.glowMid} />
      </View>
    </>
  );
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('features');
  const [featureIndex, setFeatureIndex] = useState(0);

  const [flowIndex, setFlowIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  // One navigation per render — blocks rapid multi-taps from skipping steps
  // or pushing flowIndex out of bounds. Reset whenever the step changes.
  const navLock = useRef(false);
  const [archetype, setArchetype] = useState<ScentArchetype | null>(null);
  const [matches, setMatches] = useState<FragranceMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [ownedPicks, setOwnedPicks] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);

  // Sign-in state
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paywallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    signIn,
    signUp,
    signInWithApple,
    signInWithGoogle,
    signInLoading,
    signUpLoading,
    signInWithAppleLoading,
    signInWithGoogleLoading,
  } = useAuth();

  // Animations
  const heroAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const quizFade = useRef(new Animated.Value(0)).current;
  const quizSlide = useRef(new Animated.Value(24)).current;
  const resultFade = useRef(new Animated.Value(0)).current;
  const resultSlide = useRef(new Animated.Value(24)).current;
  const signinFade = useRef(new Animated.Value(0)).current;
  const signinSlide = useRef(new Animated.Value(24)).current;

  const animateFocal = useCallback(() => {
    heroAnim.setValue(0);
    contentAnim.setValue(0);
    Animated.stagger(90, [
      Animated.spring(heroAnim, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(contentAnim, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [heroAnim, contentAnim]);

  // Continuous soft glow pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowPulse]);

  // Animate focal point whenever the feature/social screen changes
  useEffect(() => {
    if (phase === 'features' || phase === 'social') {
      animateFocal();
    }
  }, [phase, featureIndex, animateFocal]);

  useEffect(() => {
    navLock.current = false;
    if (phase === 'quiz') {
      quizFade.setValue(0);
      quizSlide.setValue(24);
      Animated.parallel([
        Animated.timing(quizFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(quizSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [phase, flowIndex, quizFade, quizSlide]);

  useEffect(() => {
    if (phase === 'result') {
      resultFade.setValue(0);
      resultSlide.setValue(24);
      Animated.parallel([
        Animated.timing(resultFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(resultSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [phase, resultFade, resultSlide]);

  useEffect(() => {
    if (phase === 'signin') {
      signinFade.setValue(0);
      signinSlide.setValue(24);
      Animated.parallel([
        Animated.timing(signinFade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(signinSlide, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [phase, signinFade, signinSlide]);

  // Prefill referral code from a deep link
  useEffect(() => {
    void getPendingReferralCode().then((code) => {
      if (code) {
        setReferralCode(code);
        setAuthMode('signup');
      }
    });
  }, []);

  // Clear any pending timers on unmount to avoid state updates / navigation
  // attempts after the onboarding screen is gone.
  useEffect(() => {
    return () => {
      if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
      if (paywallTimer.current) clearTimeout(paywallTimer.current);
    };
  }, []);

  const haptic = useCallback((style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(style);
  }, []);

  // ---- Feature navigation ----
  const nextFeature = useCallback(() => {
    haptic();
    if (featureIndex < FEATURES.length - 1) {
      setFeatureIndex((i) => i + 1);
    } else {
      setPhase('social');
    }
  }, [featureIndex, haptic]);

  const prevFeature = useCallback(() => {
    if (featureIndex > 0) {
      setFeatureIndex((i) => i - 1);
    }
  }, [featureIndex]);

  const startQuiz = useCallback(() => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFlowIndex(0);
    setPhase('quiz');
  }, []);

  // ---- Quiz ----
  const fetchMatches = useCallback(async (seeds: string[]) => {
    setMatchesLoading(true);
    try {
      const seen = new Set<string>();
      const collected: FragranceMatch[] = [];
      for (const seed of seeds.slice(0, 3)) {
        if (collected.length >= 6) break;
        const results = await searchFragrances(seed, 8);
        for (const r of results) {
          if (!r?.name) continue;
          const key = `${r.name}|${r.brand}`.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push({
            name: r.name,
            brand: r.brand ?? '',
            concentration: r.concentration ?? null,
            topNotes: r.topNotes ?? [],
            heartNotes: r.heartNotes ?? [],
            baseNotes: r.baseNotes ?? [],
            imageUrl: forceHttps(r.imageUrl ?? null),
          });
          if (collected.length >= 6) break;
        }
      }
      setMatches(collected);
    } catch (e) {
      console.log('Failed to fetch onboarding matches:', e);
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }, []);

  const goToResult = useCallback(async () => {
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    const a = answers;
    const results: QuizResults = {
      scentFamilies: a['scentFamilies'] ?? [],
      favoriteNotes: a['favoriteNotes'] ?? [],
      occasions: a['occasions'] ?? [],
      priorities: a['priorities'] ?? [],
      experienceLevel: a['experienceLevel']?.[0] ?? null,
      collectionSize: a['collectionSize']?.[0] ?? null,
      struggles: a['struggles'] ?? [],
      discoveryStyle: a['discoveryStyle']?.[0] ?? null,
      intensity: a['intensity']?.[0] ?? null,
      personality: a['personality'] ?? [],
      seasons: a['seasons'] ?? [],
      goals: a['goals'] ?? [],
      budget: a['budget']?.[0] ?? null,
      adventurousness: a['adventurousness']?.[0] ?? null,
      signatureStatus: a['signatureStatus']?.[0] ?? null,
      gender: a['gender']?.[0] ?? null,
      completedAt: new Date().toISOString(),
    };
    try {
      await AsyncStorage.setItem(ONBOARDING_QUIZ_KEY, JSON.stringify(results));
    } catch (e) {
      console.log('Failed to save quiz results:', e);
    }
    const computed = computeArchetype(results);
    setArchetype(computed);
    setPhase('result');
    void fetchMatches(computed.searchSeeds);
  }, [answers, fetchMatches]);

  const toggleOwned = useCallback((match: FragranceMatch) => {
    haptic();
    const key = `${match.name}|${match.brand}`;
    setOwnedPicks((prev) => ({ ...prev, [key]: !prev[key] }));
  }, [haptic]);

  const toggleAnswer = useCallback((key: string, label: string, type: QuizQuestionType) => {
    haptic();
    setAnswers((prev) => {
      const cur = prev[key] ?? [];
      if (type === 'single') {
        return { ...prev, [key]: [label] };
      }
      if (cur.includes(label)) {
        return { ...prev, [key]: cur.filter((s) => s !== label) };
      }
      return { ...prev, [key]: [...cur, label] };
    });
  }, [haptic]);

  const flowNext = useCallback(() => {
    if (navLock.current) return;
    navLock.current = true;
    haptic();
    if (flowIndex < QUIZ_FLOW.length - 1) {
      setFlowIndex((i) => Math.min(i + 1, QUIZ_FLOW.length - 1));
    } else {
      void goToResult();
    }
  }, [flowIndex, goToResult, haptic]);

  const flowBack = useCallback(() => {
    if (navLock.current) return;
    navLock.current = true;
    if (flowIndex > 0) {
      setFlowIndex((i) => Math.max(i - 1, 0));
    } else {
      setPhase('social');
    }
  }, [flowIndex]);

  // ---- Flow to sign-in ----
  const saveStarterPicks = useCallback(async () => {
    const picks: StarterPick[] = matches
      .filter((m) => ownedPicks[`${m.name}|${m.brand}`])
      .map((m) => ({
        name: m.name,
        brand: m.brand,
        concentration: m.concentration ?? null,
        topNotes: m.topNotes ?? [],
        heartNotes: m.heartNotes ?? [],
        baseNotes: m.baseNotes ?? [],
        imageUrl: m.imageUrl ?? null,
      }));
    try {
      if (picks.length > 0) {
        await AsyncStorage.setItem(STARTER_COLLECTION_KEY, JSON.stringify(picks));
      } else {
        await AsyncStorage.removeItem(STARTER_COLLECTION_KEY);
      }
    } catch (e) {
      console.log('Failed to save starter picks:', e);
    }
  }, [matches, ownedPicks]);

  const goToSigninFromResult = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await saveStarterPicks();
    setFinishing(false);
    setAuthError(null);
    setPhase('signin');
  }, [finishing, saveStarterPicks]);

  const skipToSignin = useCallback(() => {
    haptic();
    setAuthError(null);
    setPhase('signin');
  }, [haptic]);

  // ---- Completion: provisioning runs inside sign-in (reads quiz + picks) ----
  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem('paywall_last_shown_at', String(Date.now()));
      await AsyncStorage.setItem('paywall_open_count', '0');
    } catch (e) {
      console.log('Failed to record paywall trigger:', e);
    }
    if (onComplete) {
      // _layout opens the paywall once the main Stack has mounted.
      onComplete();
    } else {
      // Standalone fallback (no host gate): navigate home then nudge the paywall.
      try {
        await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      } catch (e) {
        console.log('Failed to save onboarding state:', e);
      }
      router.replace('/');
      paywallTimer.current = setTimeout(() => {
        try {
          router.push({ pathname: '/paywall', params: { source: 'onboarding' } });
        } catch (e) {
          console.log('Failed to push paywall after onboarding:', e);
        }
      }, 600);
    }
  }, [onComplete, router]);

  // ---- Sign-in handlers (call useAuth directly; Stack is not mounted yet) ----
  const handleApple = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithApple();
      await completeOnboarding();
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      setAuthError(err?.message || 'Apple sign-in failed');
    }
  }, [signInWithApple, completeOnboarding]);

  const handleGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
      await completeOnboarding();
    } catch (err: any) {
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === '12501') return;
      setAuthError(err?.message || 'Google sign-in failed');
    }
  }, [signInWithGoogle, completeOnboarding]);

  const checkUsername = useCallback((value: string) => {
    if (usernameTimeout.current) clearTimeout(usernameTimeout.current);
    if (!value.trim() || value.trim().length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    usernameTimeout.current = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', value.trim().toLowerCase())
          .maybeSingle();
        if (error) {
          setUsernameStatus('idle');
          return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
  }, []);

  const handleUsernameChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setUsername(sanitized);
    checkUsername(sanitized);
  }, [checkUsername]);

  const handleEmailSubmit = useCallback(async () => {
    setAuthError(null);
    const em = email.trim();
    if (!em || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }
    if (authMode === 'signup') {
      const uname = username.trim();
      if (uname.length < 3) {
        setAuthError('Pick a username with at least 3 characters.');
        return;
      }
      if (usernameStatus === 'taken') {
        setAuthError('That username is already taken.');
        return;
      }
      if (password.length < 8) {
        setAuthError('Password must be at least 8 characters.');
        return;
      }
      try {
        await signUp({
          email: em,
          password,
          username: uname,
          displayName: uname,
          referralCode: referralCode.trim() || undefined,
        });
        await completeOnboarding();
      } catch (err: any) {
        setAuthError(err?.message || 'Could not create your account.');
      }
    } else {
      try {
        await signIn({ email: em, password });
        await completeOnboarding();
      } catch (err: any) {
        setAuthError(err?.message || 'Could not sign you in.');
      }
    }
  }, [authMode, email, password, username, usernameStatus, referralCode, signUp, signIn, completeOnboarding]);

  const authBusy = signInLoading || signUpLoading || signInWithAppleLoading || signInWithGoogleLoading;

  const glowScale = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glowOpacity = glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.8] });
  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });
  const contentTranslate = contentAnim.interpolate({ inputRange: [0, 1], outputRange: [22, 0] });

  // ===================== SIGN-IN =====================
  if (phase === 'signin') {
    return (
      <View style={styles.container}>
        <Backdrop />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={[styles.signinTopBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity
              onPress={() => setPhase(archetype ? 'result' : 'features')}
              style={styles.iconBtn}
              hitSlop={10}
            >
              <CaretLeft size={20} color={SUBTEXT} weight="bold" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={[styles.signinScroll, { paddingBottom: insets.bottom + 28 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={{ opacity: signinFade, transform: [{ translateY: signinSlide }] }}>
              <View style={styles.signinHeroWrap}>
                <Animated.View style={[styles.heroGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
                <View style={styles.heroTileSm}>
                  <Sparkle size={30} color={GOLD} weight="fill" />
                </View>
              </View>

              <Text style={styles.signinTitle}>
                {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={styles.signinSub}>
                {authMode === 'signup'
                  ? 'One last step — sign in to save your collection and sync everywhere.'
                  : 'Sign in to pick up right where you left off.'}
              </Text>

              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.appleBtn, authBusy && styles.btnDim]}
                  onPress={handleApple}
                  disabled={authBusy}
                  activeOpacity={0.85}
                  testID="apple-signin-button"
                >
                  {signInWithAppleLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <AppleLogo size={20} color="#fff" weight="fill" />
                      <Text style={styles.appleBtnText}>Continue with Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  style={[styles.googleBtn, authBusy && styles.btnDim]}
                  onPress={handleGoogle}
                  disabled={authBusy}
                  activeOpacity={0.85}
                  testID="google-signin-button"
                >
                  {signInWithGoogleLoading ? (
                    <ActivityIndicator color="#3c4043" />
                  ) : (
                    <>
                      <AntDesign name="google" size={18} color="#4285F4" />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or use email</Text>
                <View style={styles.dividerLine} />
              </View>

              {authMode === 'signup' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputShell}>
                    <Text style={styles.inputAt}>@</Text>
                    <TextInput
                      style={styles.inputFlex}
                      value={username}
                      onChangeText={handleUsernameChange}
                      placeholder="username"
                      placeholderTextColor={FAINT}
                      autoCapitalize="none"
                      autoCorrect={false}
                      testID="username-input"
                    />
                    {usernameStatus === 'checking' && <ActivityIndicator size="small" color={SUBTEXT} />}
                    {usernameStatus === 'available' && <Check size={16} color="#34c759" weight="bold" />}
                    {usernameStatus === 'taken' && <WarningCircle size={16} color="#ff6b6b" weight="fill" />}
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <View style={styles.inputShell}>
                  <TextInput
                    style={styles.inputFlex}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    placeholderTextColor={FAINT}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    testID="email-input"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.inputShell}>
                  <TextInput
                    style={styles.inputFlex}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={FAINT}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    testID="password-input"
                  />
                  <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={10}>
                    {showPassword ? <EyeSlash size={18} color={SUBTEXT} /> : <Eye size={18} color={SUBTEXT} />}
                  </TouchableOpacity>
                </View>
              </View>

              {authMode === 'signup' && !!referralCode && (
                <View style={styles.referralPill}>
                  <Sparkle size={13} color={GOLD} weight="fill" />
                  <Text style={styles.referralText}>Referral code {referralCode} applied</Text>
                </View>
              )}

              {!!authError && (
                <View style={styles.errorRow}>
                  <WarningCircle size={15} color="#ff6b6b" weight="fill" />
                  <Text style={styles.errorText}>{authError}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryBtn, authBusy && styles.btnDim]}
                onPress={handleEmailSubmit}
                disabled={authBusy}
                activeOpacity={0.9}
                testID="email-submit"
              >
                {(signInLoading || signUpLoading) ? (
                  <ActivityIndicator color="#1a1208" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {authMode === 'signup' ? 'Create account' : 'Sign in'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => {
                  setAuthError(null);
                  setAuthMode((m) => (m === 'signup' ? 'login' : 'signup'));
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.toggleText}>
                  {authMode === 'signup' ? 'Already have an account? ' : 'New to Scentbuddy? '}
                  <Text style={styles.toggleTextAccent}>
                    {authMode === 'signup' ? 'Sign in' : 'Create one'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ===================== RESULT =====================
  if (phase === 'result' && archetype) {
    const ownedCount = matches.filter((m) => ownedPicks[`${m.name}|${m.brand}`]).length;
    return (
      <View style={styles.container}>
        <Backdrop />
        <ScrollView
          contentContainerStyle={[
            styles.resultScroll,
            { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: resultFade, transform: [{ translateY: resultSlide }] }}>
            <View style={styles.resultBadge}>
              <Sparkle size={16} color={GOLD} weight="fill" />
              <Text style={styles.resultBadgeText}>YOUR SCENT PROFILE</Text>
            </View>

            <Text style={styles.resultArchetype}>{archetype.name}</Text>
            <Text style={styles.resultTagline}>{archetype.tagline}</Text>

            <View style={styles.resultCard}>
              {archetype.families.map((fam) => (
                <View key={fam.label} style={styles.familyRow}>
                  <View style={styles.familyLabelRow}>
                    <Text style={styles.familyLabel}>{fam.label}</Text>
                    <Text style={styles.familyPct}>{fam.pct}%</Text>
                  </View>
                  <View style={styles.familyTrack}>
                    <View style={[styles.familyFill, { width: `${fam.pct}%`, backgroundColor: fam.color }]} />
                  </View>
                </View>
              ))}
            </View>

            <Text style={styles.resultDescription}>{archetype.description}</Text>

            <View style={styles.matchesHeaderRow}>
              <Text style={styles.matchesTitle}>Scents in your DNA</Text>
              <Text style={styles.matchesSub}>Tap the ones you already own</Text>
            </View>

            {matchesLoading ? (
              <View style={styles.matchesLoading}>
                <ActivityIndicator color={GOLD} />
                <Text style={styles.matchesLoadingText}>Matching your profile...</Text>
              </View>
            ) : matches.length === 0 ? (
              <Text style={styles.matchesEmpty}>
                We'll surface personalized matches once you're in. Continue to start your collection.
              </Text>
            ) : (
              <View style={styles.matchesList}>
                {matches.map((m) => {
                  const key = `${m.name}|${m.brand}`;
                  const owned = !!ownedPicks[key];
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.matchRow, owned && styles.matchRowSelected]}
                      onPress={() => toggleOwned(m)}
                      activeOpacity={0.8}
                    >
                      {m.imageUrl ? (
                        <Image source={{ uri: m.imageUrl }} style={styles.matchImage} />
                      ) : (
                        <View style={[styles.matchImage, styles.matchImagePlaceholder]}>
                          <Drop size={20} color={GOLD} />
                        </View>
                      )}
                      <View style={styles.matchInfo}>
                        <Text style={styles.matchName} numberOfLines={1}>{m.name}</Text>
                        <Text style={styles.matchBrand} numberOfLines={1}>{m.brand}</Text>
                      </View>
                      <View style={[styles.matchCheckbox, owned && styles.matchCheckboxSelected]}>
                        {owned ? <Check size={14} color="#1a1208" weight="bold" /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, finishing && styles.btnDim]}
            onPress={goToSigninFromResult}
            disabled={finishing}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>
              {ownedCount > 0 ? `Add ${ownedCount} & continue` : 'Continue'}
            </Text>
            <ArrowRight size={18} color="#1a1208" weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===================== QUIZ =====================
  if (phase === 'quiz') {
    const step = QUIZ_FLOW[flowIndex];
    if (!step) return null;
    const progress = ((flowIndex + 1) / QUIZ_FLOW.length) * 100;
    const questionSel = step.kind === 'question' ? (answers[step.key] ?? []) : [];
    const minReq = step.kind === 'question' ? (QUESTION_BY_KEY[step.key].min ?? 1) : 0;
    const canAdvance = step.kind !== 'question' || questionSel.length >= minReq;
    const questionNo = QUIZ_FLOW.slice(0, flowIndex + 1).filter((f) => f.kind === 'question').length;

    let ctaLabel = 'Continue';
    let ctaSparkle = false;
    if (step.kind === 'interstitial') {
      if (step.id === 'summary') {
        ctaLabel = 'Reveal my Scent DNA';
        ctaSparkle = true;
      } else if (step.id === 'solution') {
        ctaLabel = 'I want this';
      } else if (step.id === 'gap') {
        ctaLabel = 'Show me the plan';
      }
    }

    // Answer-derived values for the narrative interstitials.
    const exp = (answers['experienceLevel'] ?? [])[0];
    const col = (answers['collectionSize'] ?? [])[0];
    const discovery = (answers['discoveryStyle'] ?? [])[0];
    const struggles = answers['struggles'] ?? [];
    const goals = answers['goals'] ?? [];
    const families = answers['scentFamilies'] ?? [];
    const notes = answers['favoriteNotes'] ?? [];
    const personality = answers['personality'] ?? [];
    const seasons = answers['seasons'] ?? [];
    const occasions = answers['occasions'] ?? [];
    const intensity = (answers['intensity'] ?? [])[0];
    const budget = (answers['budget'] ?? [])[0];
    const adventurousness = (answers['adventurousness'] ?? [])[0];
    const gender = (answers['gender'] ?? [])[0];

    const summaryGroups = [
      { label: 'Loves', items: families },
      { label: 'Notes', items: notes },
      { label: 'Vibe', items: personality },
      { label: 'Seasons', items: seasons },
      { label: 'Wears for', items: occasions },
      { label: 'Style', items: [intensity, budget, adventurousness, gender].filter(Boolean) as string[] },
      { label: 'Goals', items: goals },
    ];

    return (
      <View style={styles.container}>
        <Backdrop />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={flowBack} style={styles.iconBtn} hitSlop={10}>
            <CaretLeft size={20} color={SUBTEXT} weight="bold" />
          </TouchableOpacity>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <TouchableOpacity onPress={skipToSignin} style={styles.skipBtn} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.quizContent, { opacity: quizFade, transform: [{ translateY: quizSlide }] }]}>
          {step.kind === 'question' ? (
            (() => {
              const q = QUESTION_BY_KEY[step.key];
              return (
                <>
                  <Text style={styles.quizEyebrow}>
                    {q.part} · {questionNo} OF {QUIZ_QUESTION_COUNT}
                  </Text>
                  <Text style={styles.quizTitle}>{q.title}</Text>
                  <Text style={styles.quizSubtitle}>{q.subtitle}</Text>

                  <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.quizOptionsContainer}
                    showsVerticalScrollIndicator={false}
                  >
                    {q.options.map((opt) => {
                      const selected = questionSel.includes(opt.label);
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[styles.quizOption, selected && styles.quizOptionSelected]}
                          onPress={() => toggleAnswer(q.key, opt.label, q.type)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.quizOptionLeft}>
                            <Text style={styles.quizOptionEmoji}>{opt.emoji}</Text>
                            <View style={styles.flex}>
                              <Text style={[styles.quizOptionLabel, selected && styles.quizOptionLabelSelected]}>
                                {opt.label}
                              </Text>
                              {opt.sub ? <Text style={styles.quizOptionSub}>{opt.sub}</Text> : null}
                            </View>
                          </View>
                          {q.type === 'single' ? (
                            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                              {selected ? <View style={styles.radioInner} /> : null}
                            </View>
                          ) : (
                            <View style={[styles.quizCheckbox, selected && styles.quizCheckboxSelected]}>
                              {selected ? <Check size={14} color="#1a1208" weight="bold" /> : null}
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              );
            })()
          ) : (
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.interScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {step.id === 'status' && (
                <>
                  <View style={styles.interBadge}>
                    <MapPin size={14} color={GOLD} weight="fill" />
                    <Text style={styles.interBadgeText}>WHERE YOU ARE TODAY</Text>
                  </View>
                  <Text style={styles.interTitle}>Here&apos;s your{'\n'}starting point</Text>
                  <Text style={styles.interSub}>Everything after this is built around exactly this.</Text>

                  <View style={styles.interCard}>
                    {exp ? (
                      <View style={styles.interRow}>
                        <Text style={styles.interRowLabel}>Experience</Text>
                        <Text style={styles.interRowValue}>{exp}</Text>
                      </View>
                    ) : null}
                    {col ? (
                      <>
                        <View style={styles.interDivider} />
                        <View style={styles.interRow}>
                          <Text style={styles.interRowLabel}>Collection</Text>
                          <Text style={styles.interRowValue}>{col} fragrances</Text>
                        </View>
                      </>
                    ) : null}
                    {discovery ? (
                      <>
                        <View style={styles.interDivider} />
                        <View style={styles.interRow}>
                          <Text style={styles.interRowLabel}>Finds scents via</Text>
                          <Text style={styles.interRowValue}>{discovery}</Text>
                        </View>
                      </>
                    ) : null}
                  </View>

                  {struggles.length > 0 && (
                    <>
                      <Text style={styles.interSectionLabel}>What&apos;s holding you back</Text>
                      <View style={styles.struggleList}>
                        {struggles.map((str) => (
                          <View key={str} style={styles.struggleRow}>
                            <WarningCircle size={18} color="#e8a87c" weight="fill" />
                            <Text style={styles.struggleText}>{str}</Text>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}

              {step.id === 'gap' && (
                <>
                  <View style={styles.interBadge}>
                    <TrendUp size={14} color={GOLD} weight="fill" />
                    <Text style={styles.interBadgeText}>THE GAP</Text>
                  </View>
                  <Text style={styles.interTitle}>From where you are{'\n'}to where you want to be</Text>

                  <View style={styles.gapBlock}>
                    <Text style={styles.gapBlockLabel}>TODAY</Text>
                    <Text style={styles.gapBlockText}>
                      {[col ? `${col} bottles` : null, exp ? exp.toLowerCase() : null]
                        .filter(Boolean)
                        .join(' · ') || 'Just getting started'}
                    </Text>
                  </View>

                  <View style={styles.gapArrow}>
                    <ArrowDown size={22} color={GOLD} weight="bold" />
                  </View>

                  <View style={styles.gapBlockGold}>
                    <Text style={styles.gapBlockLabelGold}>WHERE YOU WANT TO BE</Text>
                    <Text style={styles.gapBlockTextGold}>
                      {goals.length ? goals.slice(0, 2).join(' · ') : 'A collection that feels like you'}
                    </Text>
                  </View>

                  <View style={styles.gapCallout}>
                    <Text style={styles.gapCalloutText}>
                      That distance is the gap — and closing it by guessing alone is slow and expensive.
                      ScentBuddy gets you there faster.
                    </Text>
                  </View>
                </>
              )}

              {step.id === 'solution' && (
                <>
                  <View style={styles.interBadge}>
                    <Sparkle size={14} color={GOLD} weight="fill" />
                    <Text style={styles.interBadgeText}>YOUR PERSONAL PLAN</Text>
                  </View>
                  <Text style={styles.interTitle}>How ScentBuddy{'\n'}closes your gap</Text>
                  <Text style={styles.interSub}>Built from your answers — not a generic tour.</Text>

                  <View style={styles.solutionList}>
                    {buildSolutions(struggles, goals).map((r) => {
                      const Icon = r.icon;
                      return (
                        <View key={r.title} style={styles.solutionRow}>
                          <View style={styles.solutionIcon}>
                            <Icon size={22} color={GOLD} weight="duotone" />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.solutionTitle}>{r.title}</Text>
                            <Text style={styles.solutionDesc}>{r.desc}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              )}

              {step.id === 'summary' && (
                <>
                  <View style={styles.interBadge}>
                    <Sparkle size={14} color={GOLD} weight="fill" />
                    <Text style={styles.interBadgeText}>YOUR SCENT SNAPSHOT</Text>
                  </View>
                  <Text style={styles.interTitle}>This is you,{'\n'}in fragrance</Text>
                  <Text style={styles.interSub}>
                    Everything you told us, in one place. Ready for your Scent DNA?
                  </Text>

                  {summaryGroups.map((grp) =>
                    grp.items.length ? (
                      <View key={grp.label} style={styles.summaryGroup}>
                        <Text style={styles.summaryGroupLabel}>{grp.label}</Text>
                        <View style={styles.chipWrap}>
                          {grp.items.map((it) => (
                            <View key={it} style={styles.chip}>
                              <Text style={styles.chipText}>{it}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null,
                  )}
                </>
              )}
            </ScrollView>
          )}
        </Animated.View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, !canAdvance && styles.btnDim]}
            onPress={flowNext}
            disabled={!canAdvance}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
            {ctaSparkle ? (
              <Sparkle size={18} color="#1a1208" weight="fill" />
            ) : (
              <ArrowRight size={18} color="#1a1208" weight="bold" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===================== SOCIAL PROOF =====================
  if (phase === 'social') {
    return (
      <View style={styles.container}>
        <Backdrop />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => setPhase('features')} style={styles.iconBtn} hitSlop={10}>
            <CaretLeft size={20} color={SUBTEXT} weight="bold" />
          </TouchableOpacity>
          <View style={styles.flex} />
          <TouchableOpacity onPress={skipToSignin} style={styles.skipBtn} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.socialScroll}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: contentAnim, transform: [{ translateY: contentTranslate }] }}>
            <View style={styles.starsRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={20} color={GOLD} weight="fill" />
              ))}
            </View>
            <Text style={styles.socialTitle}>Loved by collectors</Text>
            <Text style={styles.socialSub}>Join thousands building their scent library with Scentbuddy.</Text>

            {TESTIMONIALS.map((t) => (
              <View key={t.name} style={styles.testimonialCard}>
                <View style={styles.starsRowSm}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={12} color={GOLD} weight="fill" />
                  ))}
                </View>
                <Text style={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</Text>
                <Text style={styles.testimonialName}>
                  {t.name} <Text style={styles.testimonialHandle}>· {t.handle}</Text>
                </Text>
              </View>
            ))}
          </Animated.View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={styles.primaryBtn} onPress={startQuiz} activeOpacity={0.9}>
            <Sparkle size={18} color="#1a1208" weight="fill" />
            <Text style={styles.primaryBtnText}>Take the scent quiz</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===================== FEATURES =====================
  const feature = FEATURES[featureIndex];
  const FeatureIcon = feature.icon;
  const isLastFeature = featureIndex === FEATURES.length - 1;

  return (
    <View style={styles.container}>
      <Backdrop />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={prevFeature}
          style={[styles.iconBtn, featureIndex === 0 && styles.hidden]}
          disabled={featureIndex === 0}
          hitSlop={10}
        >
          <CaretLeft size={20} color={SUBTEXT} weight="bold" />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((featureIndex + 1) / FEATURES.length) * 100}%` }]} />
        </View>
        <TouchableOpacity onPress={skipToSignin} style={styles.skipBtn} hitSlop={10} testID="onboarding-skip">
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.featureBody}>
        <Animated.View style={[styles.heroWrap, { transform: [{ scale: heroScale }], opacity: heroAnim }]}>
          <Animated.View style={[styles.heroGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
          <View style={styles.heroTile}>
            <FeatureIcon size={48} color={GOLD} weight="duotone" />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: contentAnim, transform: [{ translateY: contentTranslate }] }}>
          <Text style={styles.featureTitle}>{feature.title}</Text>
          <Text style={styles.featureSubtitle}>{feature.subtitle}</Text>
        </Animated.View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dotsRow}>
          {FEATURES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === featureIndex ? GOLD : 'rgba(255,255,255,0.18)', width: i === featureIndex ? 24 : 7 },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={nextFeature} activeOpacity={0.9} testID="onboarding-next">
          <Text style={styles.primaryBtnText}>{isLastFeature ? 'Continue' : 'Next'}</Text>
          <ArrowRight size={18} color="#1a1208" weight="bold" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  glowWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  glowOuter: {
    position: 'absolute',
    top: -SCREEN_HEIGHT * 0.12,
    width: SCREEN_HEIGHT * 0.62,
    height: SCREEN_HEIGHT * 0.62,
    borderRadius: SCREEN_HEIGHT * 0.31,
    backgroundColor: 'rgba(196,154,108,0.07)',
  },
  glowMid: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.02,
    width: SCREEN_HEIGHT * 0.34,
    height: SCREEN_HEIGHT * 0.34,
    borderRadius: SCREEN_HEIGHT * 0.17,
    backgroundColor: 'rgba(196,154,108,0.07)',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
    zIndex: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: GOLD,
  },
  skipBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  skipText: {
    color: FAINT,
    fontSize: 15,
    fontWeight: '600',
  },

  // Feature focal point
  featureBody: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
    height: 180,
  },
  heroGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(196,154,108,0.16)',
  },
  heroTile: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: 'rgba(26,19,12,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.8,
    marginBottom: 16,
  },
  featureSubtitle: {
    fontSize: 16,
    lineHeight: 25,
    color: SUBTEXT,
    textAlign: 'center',
    maxWidth: 320,
    alignSelf: 'center',
  },

  // Footer / primary CTA
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 18,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 26,
    paddingVertical: 17,
    gap: 8,
  },
  primaryBtnText: {
    color: '#1a1208',
    fontSize: 17,
    fontWeight: '800',
  },
  btnDim: {
    opacity: 0.45,
  },

  // Social proof
  socialScroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 16,
  },
  starsRowSm: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 10,
  },
  socialTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  socialSub: {
    fontSize: 15,
    lineHeight: 22,
    color: SUBTEXT,
    textAlign: 'center',
    maxWidth: 300,
    alignSelf: 'center',
    marginBottom: 24,
  },
  testimonialCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  testimonialQuote: {
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(246,241,233,0.85)',
    marginBottom: 12,
  },
  testimonialName: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT,
  },
  testimonialHandle: {
    fontWeight: '500',
    color: FAINT,
  },

  // Quiz
  quizContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 26,
  },
  quizTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: 8,
  },
  quizSubtitle: {
    fontSize: 16,
    color: SUBTEXT,
    marginBottom: 22,
  },
  quizOptionsContainer: {
    gap: 10,
    paddingBottom: 20,
  },
  quizOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  quizOptionSelected: {
    backgroundColor: 'rgba(196,154,108,0.13)',
    borderColor: 'rgba(196,154,108,0.5)',
  },
  quizOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  quizOptionEmoji: {
    fontSize: 26,
  },
  quizOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(246,241,233,0.82)',
  },
  quizOptionLabelSelected: {
    color: TEXT,
  },
  quizOptionSub: {
    fontSize: 13,
    color: FAINT,
    marginTop: 2,
  },
  quizCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizCheckboxSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  quizEyebrow: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 10,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: GOLD,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GOLD,
  },

  // Interstitials (narrative screens)
  interScrollContent: {
    paddingTop: 6,
    paddingBottom: 24,
  },
  interBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(196,154,108,0.12)',
    marginBottom: 14,
  },
  interBadgeText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  interTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    letterSpacing: -0.6,
    lineHeight: 37,
    marginBottom: 10,
  },
  interSub: {
    fontSize: 16,
    lineHeight: 23,
    color: SUBTEXT,
    marginBottom: 22,
  },
  interCard: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  interRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    gap: 12,
  },
  interRowLabel: {
    color: SUBTEXT,
    fontSize: 14,
    fontWeight: '600',
  },
  interRowValue: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  interDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  interSectionLabel: {
    color: FAINT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 24,
    marginBottom: 12,
  },
  struggleList: {
    gap: 8,
  },
  struggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(232,168,124,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,124,0.22)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  struggleText: {
    flex: 1,
    color: 'rgba(246,241,233,0.9)',
    fontSize: 15,
    fontWeight: '600',
  },
  gapBlock: {
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  gapBlockGold: {
    backgroundColor: 'rgba(196,154,108,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.5)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  gapBlockLabel: {
    color: FAINT,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  gapBlockLabelGold: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  gapBlockText: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  gapBlockTextGold: {
    color: GOLD_LIGHT,
    fontSize: 17,
    fontWeight: '700',
  },
  gapArrow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  gapCallout: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
  },
  gapCalloutText: {
    color: 'rgba(246,241,233,0.72)',
    fontSize: 15,
    lineHeight: 23,
  },
  solutionList: {
    gap: 10,
  },
  solutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 14,
  },
  solutionIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: 'rgba(196,154,108,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solutionTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  solutionDesc: {
    color: SUBTEXT,
    fontSize: 13.5,
    lineHeight: 19,
  },
  summaryGroup: {
    marginBottom: 18,
  },
  summaryGroupLabel: {
    color: FAINT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(196,154,108,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.3)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: GOLD_LIGHT,
    fontSize: 14,
    fontWeight: '600',
  },

  // Result
  resultScroll: {
    paddingHorizontal: 24,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(196,154,108,0.12)',
    marginBottom: 14,
  },
  resultBadgeText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  resultArchetype: {
    color: TEXT,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 6,
  },
  resultTagline: {
    color: SUBTEXT,
    fontSize: 16,
    marginBottom: 24,
  },
  resultCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 18,
    gap: 14,
  },
  familyRow: {
    gap: 8,
  },
  familyLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  familyLabel: {
    color: 'rgba(246,241,233,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  familyPct: {
    color: SUBTEXT,
    fontSize: 13,
    fontWeight: '700',
  },
  familyTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  familyFill: {
    height: 8,
    borderRadius: 4,
  },
  resultDescription: {
    color: 'rgba(246,241,233,0.65)',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 20,
  },
  matchesHeaderRow: {
    marginTop: 28,
    marginBottom: 14,
  },
  matchesTitle: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '700',
  },
  matchesSub: {
    color: SUBTEXT,
    fontSize: 14,
    marginTop: 2,
  },
  matchesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  matchesLoadingText: {
    color: SUBTEXT,
    fontSize: 14,
  },
  matchesEmpty: {
    color: SUBTEXT,
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 8,
  },
  matchesList: {
    gap: 10,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 10,
    gap: 12,
  },
  matchRowSelected: {
    borderColor: GOLD,
    backgroundColor: 'rgba(196,154,108,0.12)',
  },
  matchImage: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  matchImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchInfo: {
    flex: 1,
  },
  matchName: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '600',
  },
  matchBrand: {
    color: SUBTEXT,
    fontSize: 13,
    marginTop: 2,
  },
  matchCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCheckboxSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  // Sign-in
  signinTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  signinScroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  signinHeroWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 110,
    marginBottom: 8,
  },
  heroTileSm: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(26,19,12,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(196,154,108,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signinTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT,
    textAlign: 'center',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  signinSub: {
    fontSize: 15,
    lineHeight: 22,
    color: SUBTEXT,
    textAlign: 'center',
    maxWidth: 320,
    alignSelf: 'center',
    marginBottom: 26,
  },
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 26,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 12,
  },
  appleBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 26,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 12,
  },
  googleBtnText: {
    color: '#3c4043',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: FAINT,
    fontSize: 13,
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  inputAt: {
    color: SUBTEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  inputFlex: {
    flex: 1,
    color: TEXT,
    fontSize: 16,
    paddingVertical: 15,
  },
  referralPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(196,154,108,0.12)',
    marginBottom: 12,
  },
  referralText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '600',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  errorText: {
    flex: 1,
    color: '#ff8a8a',
    fontSize: 14,
    lineHeight: 19,
  },
  toggleRow: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  toggleText: {
    color: SUBTEXT,
    fontSize: 15,
  },
  toggleTextAccent: {
    color: GOLD,
    fontWeight: '700',
  },
});
