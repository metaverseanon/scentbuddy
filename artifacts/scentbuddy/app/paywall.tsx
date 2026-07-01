import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { X, Check, Crown, Sparkle, Star, ArrowCounterClockwise, Timer, ShieldCheck, Gift } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PurchasesPackage } from 'react-native-purchases';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { computeArchetype, ScentArchetype } from '@/lib/scent-archetype';
import { ONBOARDING_QUIZ_KEY, QuizResults } from '@/constants/quiz';
import { logAnalyticsEvent } from '@/lib/analytics';
import { isWinbackEligible, markWinbackShown, incrementPaywallDismissCount } from '@/lib/winback';
import { markPaywallMounted, markPaywallUnmounted } from '@/lib/paywallGuard';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const PRO_FEATURES = [
  { icon: '✨', title: 'For You Picks, tuned to you', desc: 'Get matched to your perfect scents from 74,000+ fragrances — the moment you log in' },
  { icon: '👯', title: 'Find your scent twins', desc: 'See up to 100 people with the same taste as you (free users only see 3)' },
  { icon: '♾️', title: 'Unlimited collection', desc: 'Track every bottle you own — free is capped at 5' },
  { icon: '📊', title: 'Deep analytics & shelf view', desc: 'Wear trends, note evolution, seasonal patterns, and a beautiful shelf layout' },
  { icon: '🎯', title: 'Unlimited goals & streaks', desc: 'Set as many fragrance goals as you want — free is capped at 1' },
  { icon: '🤖', title: 'AI scanner & recommendations', desc: 'Scan any bottle, get personalized suggestions, find dupes for niche scents' },
  { icon: '☁️', title: 'Cloud sync across devices', desc: 'Your collection, diary, and stats — always backed up' },
];

const LAUNCH_OFFER_KEY = '@scentbuddy:launch_offer_started_at';
const LAUNCH_OFFER_DURATION_MS = 48 * 60 * 60 * 1000;

const IOS_MONTHLY_PRODUCT_ID = 'sb_monthly';
const IOS_YEARLY_PRODUCT_ID = 'sb_yearly';
const IOS_WEEKLY_PRODUCT_ID = 'sb_weekly';

function isAnnualPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_YEARLY_PRODUCT_ID || pkg.identifier === '$rc_annual' || pkg.packageType === 'ANNUAL';
}

function isMonthlyPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_MONTHLY_PRODUCT_ID || pkg.identifier === '$rc_monthly' || pkg.packageType === 'MONTHLY';
}

function isWeeklyPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_WEEKLY_PRODUCT_ID || pkg.identifier === '$rc_weekly' || pkg.packageType === 'WEEKLY';
}

function getPlanName(pkg: PurchasesPackage | null): string {
  if (isAnnualPlan(pkg)) return 'Yearly';
  if (isMonthlyPlan(pkg)) return 'Monthly';
  if (isWeeklyPlan(pkg)) return 'Weekly';
  return 'Plan';
}

// Display order: Yearly (best value, default-selected) → Monthly → Weekly.
function planOrder(pkg: PurchasesPackage): number {
  if (isAnnualPlan(pkg)) return 0;
  if (isMonthlyPlan(pkg)) return 1;
  if (isWeeklyPlan(pkg)) return 2;
  return 3;
}

function formatPrice(pkg: PurchasesPackage): string {
  const product = pkg.product;
  if (product.priceString) return product.priceString;
  if (isAnnualPlan(pkg)) return '$35.95';
  if (isWeeklyPlan(pkg)) return '$1.99';
  return '$5.99';
}

function getPeriodLabel(pkg: PurchasesPackage): string {
  if (isAnnualPlan(pkg)) return 'year';
  if (isMonthlyPlan(pkg)) return 'month';
  if (isWeeklyPlan(pkg)) return 'week';
  return 'period';
}

function getSavingsText(packages: PurchasesPackage[]): string | null {
  const annual = packages.find(isAnnualPlan);
  if (!annual) return null;
  return 'Save 50%';
}

function priceOf(pkg: PurchasesPackage | undefined): number | null {
  const price = (pkg?.product as { price?: number } | undefined)?.price;
  return typeof price === 'number' ? price : null;
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = params.source ?? 'unknown';
  const {
    packages: rawPackages,
    winbackPackages: rawWinbackPackages,
    isLoadingOfferings,
    purchasePackage,
    isPurchasing,
    restorePurchases,
    isRestoring,
    isPro,
    rcConfigured,
    rcConfigurationError,
    refetchOfferings,
  } = useRevenueCat();

  // All plans from the active offering are shown (Yearly + Monthly + Weekly).
  // Plans render dynamically: selection, sorting (planOrder), purchase, labels,
  // and savings logic all already handle weekly, so a weekly package added to
  // the RevenueCat offering surfaces automatically once the build is live.
  const packages = rawPackages;
  const winbackPackages = rawWinbackPackages;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [winbackMode, setWinbackMode] = useState<boolean>(false);
  const winbackModeRef = useRef<boolean>(false);
  winbackModeRef.current = winbackMode;
  // Track the selected plan by its stable identifier (string), never by object
  // reference. RevenueCat hands back brand-new package objects on every offerings
  // refetch (and first login fires several rapid refetches), so a reference-based
  // selection would be invalidated every refetch and re-set in a render loop that
  // freezes the JS thread. Deriving the package from the CURRENT list also fixes
  // win-back mode reusing the same identifiers ($rc_annual, etc.): the resolved
  // package always comes from the active list, so it can never be a stale
  // standard-offering object.
  const activeList = winbackMode ? winbackPackages : packages;
  const selectedPkg = useMemo<PurchasesPackage | null>(
    () => activeList.find(p => p.identifier === selectedId) ?? null,
    [activeList, selectedId],
  );
  const winbackShownLoggedRef = useRef<boolean>(false);
  const [launchOfferEndsAt, setLaunchOfferEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [archetype, setArchetype] = useState<ScentArchetype | null>(null);
  const viewStartRef = useRef<number>(Date.now());
  const dismissLoggedRef = useRef<boolean>(false);
  const viewedLoggedRef = useRef<boolean>(false);
  const convertedRef = useRef<boolean>(false);
  const sourceRef = useRef<string>(source);
  sourceRef.current = source;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const crownScale = useRef(new Animated.Value(0.5)).current;
  // Precompute the staggered translateY nodes ONCE. Creating `new Animated.Value`
  // inside the render (per feature card) leaked a fresh native node on every
  // render, and the 1s countdown re-renders this screen continuously.
  const featureTranslateY = useMemo(
    () => PRO_FEATURES.map((_, i) => Animated.multiply(slideAnim, 1 + i * 0.15)),
    [slideAnim],
  );

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LAUNCH_OFFER_KEY);
        let startedAt: number;
        if (stored) {
          startedAt = parseInt(stored, 10);
          if (isNaN(startedAt)) {
            startedAt = Date.now();
            await AsyncStorage.setItem(LAUNCH_OFFER_KEY, String(startedAt));
          }
        } else {
          startedAt = Date.now();
          await AsyncStorage.setItem(LAUNCH_OFFER_KEY, String(startedAt));
        }
        setLaunchOfferEndsAt(startedAt + LAUNCH_OFFER_DURATION_MS);
      } catch (err) {
        console.log('[paywall] launch offer storage error:', err);
        setLaunchOfferEndsAt(Date.now() + LAUNCH_OFFER_DURATION_MS);
      }
    })();
  }, []);

  useEffect(() => {
    if (!launchOfferEndsAt) return;
    if (now >= launchOfferEndsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [launchOfferEndsAt, now]);

  const offerActive = launchOfferEndsAt !== null && now < launchOfferEndsAt;
  const remainingMs = launchOfferEndsAt ? Math.max(0, launchOfferEndsAt - now) : 0;
  const remHours = Math.floor(remainingMs / (60 * 60 * 1000));
  const remMins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  const remSecs = Math.floor((remainingMs % (60 * 1000)) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const countdownText = `${pad(remHours)}:${pad(remMins)}:${pad(remSecs)}`;

  // Authoritative source of truth for the global "a paywall is open" guard.
  // Set on mount and cleared on unmount so a second presentation can never be
  // stacked on top of this one (the double-paywall freeze), and so the flag can
  // never get permanently stuck (unmount always clears it).
  useEffect(() => {
    markPaywallMounted();
    return () => markPaywallUnmounted();
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.spring(crownScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, crownScale]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ONBOARDING_QUIZ_KEY);
        if (raw) {
          const results = JSON.parse(raw) as QuizResults;
          setArchetype(computeArchetype(results));
        }
      } catch (err) {
        console.log('[paywall] archetype load error:', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (viewedLoggedRef.current) return;
    viewedLoggedRef.current = true;
    viewStartRef.current = Date.now();
    void logAnalyticsEvent('paywall_viewed', { source });
  }, [source]);

  useEffect(() => {
    if (isPro) convertedRef.current = true;
  }, [isPro]);

  useEffect(() => {
    return () => {
      if (!dismissLoggedRef.current && !convertedRef.current) {
        dismissLoggedRef.current = true;
        const wasWinback = winbackModeRef.current;
        const secondsViewed = Math.round((Date.now() - viewStartRef.current) / 1000);
        void logAnalyticsEvent('paywall_dismissed', {
          source: sourceRef.current,
          seconds_viewed: secondsViewed,
          variant: wasWinback ? 'winback' : 'standard',
        });
        // Only standard-paywall dismissals count toward win-back eligibility; a
        // dismissed win-back offer is already spent (marked shown on display).
        if (!wasWinback) {
          void incrementPaywallDismissCount();
        }
      }
    };
  }, []);

  useEffect(() => {
    if (isPro) return;
    if (winbackMode) return;
    if (winbackPackages.length === 0) return;
    // Only present win-back if it is a VERIFIABLE discount vs standard pricing.
    // If the offering is misconfigured (no comparable standard price, or not
    // actually cheaper), degrade to the standard paywall rather than claim a
    // discount we cannot substantiate.
    const stdAnnual = priceOf(packages.find(isAnnualPlan));
    const wbAnnual = priceOf(winbackPackages.find(isAnnualPlan));
    const stdMonthly = priceOf(packages.find(isMonthlyPlan));
    const wbMonthly = priceOf(winbackPackages.find(isMonthlyPlan));
    const annualCheaper = stdAnnual !== null && wbAnnual !== null && wbAnnual < stdAnnual;
    const monthlyCheaper = stdMonthly !== null && wbMonthly !== null && wbMonthly < stdMonthly;
    if (!annualCheaper && !monthlyCheaper) return;
    let cancelled = false;
    (async () => {
      const eligible = await isWinbackEligible();
      if (!cancelled && eligible) setWinbackMode(true);
    })();
    return () => { cancelled = true; };
  }, [isPro, winbackMode, winbackPackages, packages]);

  useEffect(() => {
    if (!winbackMode) return;
    if (winbackShownLoggedRef.current) return;
    winbackShownLoggedRef.current = true;
    void markWinbackShown();
    void logAnalyticsEvent('winback_offer_shown', { source });
  }, [winbackMode, source]);

  useEffect(() => {
    if (activeList.length === 0) return;
    // Validity is checked by IDENTIFIER, and the selected package is derived from
    // the current `activeList` (see above). Identifier equality survives RevenueCat
    // refetches that mint new package objects, so we don't re-select on every
    // refetch (which previously froze the JS thread on first login). Switching into
    // win-back mode keeps the same identifier but re-resolves the object from the
    // win-back list, so the stale-standard-package concern no longer applies.
    if (selectedId != null && activeList.some(p => p.identifier === selectedId)) return;
    const annual = activeList.find(isAnnualPlan);
    const fallback = annual ?? activeList[0];
    if (fallback) setSelectedId(fallback.identifier);
  }, [activeList, selectedId]);

  useEffect(() => {
    if (isPro) {
      Alert.alert('Welcome to Pro!', 'You now have full access to all Scent Buddy Pro features.', [
        { text: 'Awesome!', onPress: () => router.back() },
      ]);
    }
  }, [isPro, router]);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPkg) return;
    // Always buy from the currently displayed list so win-back mode purchases the
    // real discounted package even if `selectedPkg` is a same-identifier standard
    // package object (standard/win-back offerings reuse `$rc_annual` etc.).
    const list = winbackMode ? winbackPackages : packages;
    const pkgToBuy = list.find(p => p.identifier === selectedPkg.identifier) ?? selectedPkg;
    const plan = isAnnualPlan(pkgToBuy) ? 'yearly' : isMonthlyPlan(pkgToBuy) ? 'monthly' : isWeeklyPlan(pkgToBuy) ? 'weekly' : 'other';
    const variant = winbackMode ? 'winback' : 'standard';
    const productId = pkgToBuy.product.identifier;
    void logAnalyticsEvent('paywall_purchase_tapped', { source, plan, product_id: productId, variant });
    if (winbackMode) {
      void logAnalyticsEvent('winback_offer_tapped', { source, plan, product_id: productId });
    }
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await purchasePackage(pkgToBuy);
      convertedRef.current = true;
      void logAnalyticsEvent('purchase_completed', { source, plan, product_id: productId, variant });
      if (winbackMode) {
        void logAnalyticsEvent('winback_purchase_completed', { source, plan, product_id: productId });
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        Alert.alert('Purchase Failed', error.message || 'Something went wrong. Please try again.');
      }
    }
  }, [selectedPkg, purchasePackage, source, winbackMode, winbackPackages, packages]);

  const handleRestore = useCallback(async () => {
    if (!rcConfigured) {
      Alert.alert(
        'Purchases Unavailable',
        'In-app purchases only work in the App Store or TestFlight build of ScentBuddy — not in Expo Go. Install the production app to manage your subscription.',
      );
      return;
    }
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await restorePurchases();
      Alert.alert('Restore Complete', isPro ? 'Your Pro subscription has been restored!' : 'No active subscription found.');
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message || 'Could not restore purchases. Please try again.');
    }
  }, [restorePurchases, isPro, rcConfigured]);

  const savingsText = offerActive ? getSavingsText(packages) : null;

  const displayPackages = (() => {
    const base = [...(winbackMode ? winbackPackages : packages)];
    return base.sort((a, b) => planOrder(a) - planOrder(b));
  })();

  // Real savings: discounted win-back annual price vs the standard annual price.
  const winbackSavingsPct: number | null = (() => {
    if (!winbackMode) return null;
    const wbPrice = priceOf(winbackPackages.find(isAnnualPlan));
    const stdPrice = priceOf(packages.find(isAnnualPlan));
    if (wbPrice !== null && stdPrice !== null && stdPrice > 0 && wbPrice < stdPrice) {
      return Math.round((1 - wbPrice / stdPrice) * 100);
    }
    return null;
  })();
  const standardAnnualPriceString: string | null =
    packages.find(isAnnualPlan)?.product.priceString ?? null;

  const annualPkg = displayPackages.find(isAnnualPlan);
  const annualMonthlyEquiv: string | null = (() => {
    if (!annualPkg) return null;
    const product: any = annualPkg.product;
    const priceNum: number | undefined = typeof product.price === 'number' ? product.price : undefined;
    const currencyCode: string | undefined = product.currencyCode;
    if (!priceNum || priceNum <= 0) return null;
    const perMonth = priceNum / 12;
    if (currencyCode) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: currencyCode,
          maximumFractionDigits: 2,
        }).format(perMonth);
      } catch {
        // fall through
      }
    }
    // Fallback: derive symbol from priceString (e.g. "$71.90" → "$", "€71,90" → "€")
    const priceString: string = product.priceString ?? '';
    const symbolMatch = priceString.match(/^[^\d\s\-.,]+/);
    const symbol = symbolMatch ? symbolMatch[0] : '';
    return `${symbol}${perMonth.toFixed(2)}`;
  })();

  const isDark = colors.background === '#0d0b08';
  const gradientTop = isDark ? '#1a1510' : '#faf7f2';
  const goldAccent = '#D4A574';
  const goldLight = '#F5E6D3';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.chip }]}
          onPress={handleClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={20} color={colors.text} weight="bold" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isRestoring}>
          <Text style={[styles.restoreText, { color: colors.subtext }]}>
            {isRestoring ? 'Restoring...' : 'Restore'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.crownContainer, { backgroundColor: goldAccent + '15', transform: [{ scale: crownScale }] }]}>
            <Crown size={48} color={goldAccent} weight="fill" />
          </Animated.View>
          {winbackMode ? (
            <>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                A special offer, <Text style={{ color: goldAccent }}>just for you</Text>
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
                {winbackSavingsPct != null
                  ? `Here's ${winbackSavingsPct}% off Pro — our lowest price, applied to the plans below.`
                  : 'Here\u2019s our best price on Pro, applied to the plans below.'}
              </Text>
            </>
          ) : archetype ? (
            <>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                Unlock your full <Text style={{ color: goldAccent }}>{archetype.name}</Text> profile
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
                {archetype.description} Go Pro to get matches, scent twins, and unlimited tracking built around your taste.
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                Discover scents you'll <Text style={{ color: goldAccent }}>actually love</Text>
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
                Stop guessing. Get AI picks from 74K+ fragrances matched to your taste — plus everything below.
              </Text>
            </>
          )}
          <View style={styles.socialProofRow}>
            <Sparkle size={14} color={goldAccent} weight="fill" />
            <Text style={[styles.socialProofText, { color: colors.subtext }]}>
              Built for fragrance enthusiasts
            </Text>
          </View>
        </Animated.View>

        {archetype && archetype.families.length > 0 && (
          <Animated.View
            style={[
              styles.archetypeCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: fadeAnim },
            ]}
          >
            <Text style={[styles.archetypeCardLabel, { color: colors.subtext }]}>YOUR SCENT DNA</Text>
            {archetype.families.map((fam) => (
              <View key={fam.label} style={styles.archetypeFamilyRow}>
                <View style={styles.archetypeFamilyLabelRow}>
                  <Text style={[styles.archetypeFamilyLabel, { color: colors.text }]}>{fam.label}</Text>
                  <Text style={[styles.archetypeFamilyPct, { color: colors.subtext }]}>{fam.pct}%</Text>
                </View>
                <View style={[styles.archetypeTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.archetypeFill, { width: `${fam.pct}%`, backgroundColor: fam.color }]} />
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {winbackMode ? (
          <View style={[styles.offerBanner, { backgroundColor: goldAccent + '15', borderColor: goldAccent }]}>
            <View style={styles.offerBannerLeft}>
              <Gift size={20} color={goldAccent} weight="fill" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.offerBannerTitle, { color: colors.text }]}>
                  {winbackSavingsPct != null ? `Your one-time ${winbackSavingsPct}% discount` : 'Your one-time discount'}
                </Text>
                <Text style={[styles.offerBannerSub, { color: colors.subtext }]}>Already applied to the plans below</Text>
              </View>
            </View>
          </View>
        ) : offerActive ? (
          <View style={[styles.offerBanner, { backgroundColor: goldAccent + '15', borderColor: goldAccent }]}>
            <View style={styles.offerBannerLeft}>
              <Timer size={20} color={goldAccent} weight="fill" />
              <View>
                <Text style={[styles.offerBannerTitle, { color: colors.text }]}>Launch offer — 50% off yearly</Text>
                <Text style={[styles.offerBannerSub, { color: colors.subtext }]}>Lock in this price before it expires</Text>
              </View>
            </View>
            <View style={[styles.offerCountdown, { backgroundColor: goldAccent }]}>
              <Text style={styles.offerCountdownText}>{countdownText}</Text>
            </View>
          </View>
        ) : null}

        {annualMonthlyEquiv && (
          <View style={[styles.priceHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.priceHeroLabel, { color: colors.subtext }]}>Yearly works out to</Text>
            <View style={styles.priceHeroRow}>
              <Text style={[styles.priceHeroBig, { color: colors.text }]}>{annualMonthlyEquiv}</Text>
              <Text style={[styles.priceHeroPer, { color: colors.subtext }]}>/month</Text>
            </View>
            <Text style={[styles.priceHeroSub, { color: colors.subtext }]}>
              Less than a fancy coffee · Cancel anytime
            </Text>
          </View>
        )}

        <View style={styles.featuresGrid}>
          {PRO_FEATURES.map((feature, i) => (
            <Animated.View
              key={feature.title}
              style={[
                styles.featureCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: fadeAnim,
                  transform: [{ translateY: featureTranslateY[i] }],
                },
              ]}
            >
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={[styles.featureTitle, { color: colors.text }]}>{feature.title}</Text>
                <Text style={[styles.featureDesc, { color: colors.subtext }]}>{feature.desc}</Text>
              </View>
              <Check size={18} color={goldAccent} weight="bold" />
            </Animated.View>
          ))}
        </View>

        <View style={[styles.guaranteeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ShieldCheck size={22} color={goldAccent} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.guaranteeTitle, { color: colors.text }]}>Risk-free</Text>
            <Text style={[styles.guaranteeSub, { color: colors.subtext }]}>
              Cancel anytime in Settings · Refunds handled by the App Store
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <ScrollView
          style={styles.footerPlans}
          contentContainerStyle={styles.footerPlansContent}
          showsVerticalScrollIndicator={false}
        >
        {isLoadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={goldAccent} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading plans...</Text>
          </View>
        ) : displayPackages.length === 0 ? (
          <View style={styles.loadingContainer}>
            {Platform.OS === 'web' ? (
              <>
                <Text style={[styles.webNotice, { color: colors.text }]}>Subscriptions available on mobile</Text>
                <Text style={[styles.loadingText, { color: colors.subtext }]}>
                  Scan the QR code to open the app on your device and subscribe there.
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.loadingText, { color: colors.subtext }]}>
                  {!rcConfigured
                    ? 'Subscription service unavailable'
                    : 'No plans available right now'}
                </Text>
                <Text style={[styles.hintText, { color: colors.subtext }]}>
                  {!rcConfigured
                    ? 'In-app purchases require the App Store or TestFlight build — they are not available in Expo Go during development.'
                    : 'Make sure you have an internet connection and try again'}
                </Text>
                {rcConfigured && (
                  <TouchableOpacity
                    style={[styles.retryBtn, { borderColor: colors.border }]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      void refetchOfferings();
                    }}
                  >
                    <ArrowCounterClockwise size={16} color={colors.accent} />
                    <Text style={[styles.retryBtnText, { color: colors.accent }]}>Retry</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={styles.packagesSection}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>Choose your plan</Text>
            {displayPackages.map((pkg) => {
              const isSelected = selectedPkg?.identifier === pkg.identifier;
              const isAnnual = isAnnualPlan(pkg);
              const cardSavings = winbackMode
                ? (isAnnual && winbackSavingsPct != null ? `Save ${winbackSavingsPct}%` : null)
                : (isAnnual ? savingsText : null);
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.packageCard,
                    {
                      backgroundColor: isSelected ? goldAccent + '10' : colors.card,
                      borderColor: isSelected ? goldAccent : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  onPress={() => {
                    setSelectedId(pkg.identifier);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.packageLeft}>
                    <View style={[styles.radioOuter, { borderColor: isSelected ? goldAccent : colors.border }]}>
                      {isSelected && <View style={[styles.radioInner, { backgroundColor: goldAccent }]} />}
                    </View>
                    <View>
                      <View style={styles.packageNameRow}>
                        <Text style={[styles.packageName, { color: colors.text }]}>
                          {getPlanName(pkg)}
                        </Text>
                        {cardSavings && (
                          <View style={[styles.savingsBadge, { backgroundColor: goldAccent }]}>
                            <Text style={styles.savingsBadgeText}>{cardSavings}</Text>
                          </View>
                        )}
                      </View>

                    </View>
                  </View>
                  <View style={styles.packageRight}>
                    {isAnnual && winbackMode && standardAnnualPriceString ? (
                      <Text style={[styles.anchorPrice, { color: colors.subtext }]}>
                        {standardAnnualPriceString}
                      </Text>
                    ) : isAnnual && !winbackMode && offerActive ? (
                      <Text style={[styles.anchorPrice, { color: colors.subtext }]}>
                        $71.90
                      </Text>
                    ) : null}
                    <Text style={[styles.packagePrice, { color: colors.text }]}>
                      {formatPrice(pkg)}
                    </Text>
                    <Text style={[styles.packagePeriod, { color: colors.subtext }]}>
                      /{getPeriodLabel(pkg)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        </ScrollView>
        <TouchableOpacity
          style={[styles.purchaseBtn, { backgroundColor: goldAccent, opacity: (!selectedPkg || isPurchasing) ? 0.6 : 1 }]}
          onPress={handlePurchase}
          disabled={!selectedPkg || isPurchasing}
          activeOpacity={0.85}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Sparkle size={20} color="#fff" weight="fill" />
              <Text style={styles.purchaseBtnText}>
                {winbackMode
                  ? 'Claim my discount'
                  : isAnnualPlan(selectedPkg)
                    ? (offerActive ? 'Claim 50% Off — Get Pro' : 'Get Pro Yearly')
                    : isWeeklyPlan(selectedPkg)
                      ? 'Get Pro Weekly'
                      : 'Get Pro Monthly'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.legalText, { color: colors.subtext }]}>
          Cancel anytime in Settings · Auto-renews
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 28,
  },
  crownContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    textAlign: 'center' as const,
    lineHeight: 34,
    paddingHorizontal: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center' as const,
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  socialProofRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginTop: 14,
    gap: 8,
  },
  starRow: {
    flexDirection: 'row' as const,
    gap: 2,
  },
  socialProofText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  archetypeCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    gap: 12,
  },
  archetypeCardLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  archetypeFamilyRow: {
    gap: 6,
  },
  archetypeFamilyLabelRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  archetypeFamilyLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  archetypeFamilyPct: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  archetypeTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  archetypeFill: {
    height: 8,
    borderRadius: 4,
  },
  offerBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 16,
    gap: 12,
  },
  offerBannerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    flex: 1,
  },
  offerBannerTitle: {
    fontSize: 14,
    fontWeight: '800' as const,
  },
  offerBannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  offerCountdown: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  offerCountdownText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800' as const,
    fontVariant: ['tabular-nums'] as const,
    letterSpacing: 0.5,
  },
  priceHero: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'center' as const,
  },
  priceHeroLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  priceHeroRow: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    marginTop: 4,
  },
  priceHeroBig: {
    fontSize: 44,
    fontWeight: '900' as const,
    letterSpacing: -1,
  },
  priceHeroPer: {
    fontSize: 18,
    fontWeight: '600' as const,
    marginLeft: 4,
  },
  priceHeroSub: {
    fontSize: 13,
    marginTop: 6,
  },
  guaranteeCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  guaranteeTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  guaranteeSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  anchorPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through' as const,
    marginBottom: 2,
  },
  featuresGrid: {
    gap: 8,
    marginBottom: 28,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
    width: 36,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  featureDesc: {
    fontSize: 13,
    marginTop: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
  },
  packagesSection: {
    gap: 8,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 2,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 13,
    borderRadius: 14,
  },
  packageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  packageNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packageName: {
    fontSize: 17,
    fontWeight: '700' as const,
  },
  packageSubline: {
    fontSize: 12,
    marginTop: 2,
  },
  savingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  savingsBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800' as const,
  },
  packageRight: {
    alignItems: 'flex-end',
  },
  packagePrice: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  packagePeriod: {
    fontSize: 13,
  },
  scroll: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerPlans: {
    maxHeight: SCREEN_HEIGHT * 0.46,
  },
  footerPlansContent: {
    paddingBottom: 4,
  },
  purchaseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  purchaseBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800' as const,
  },
  legalText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 10,
  },
  webNotice: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  hintText: {
    fontSize: 13,
    textAlign: 'center' as const,
    marginTop: 4,
    paddingHorizontal: 20,
  },
});
