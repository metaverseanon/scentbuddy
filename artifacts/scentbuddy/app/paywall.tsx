import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { X, Check, Crown, Sparkle, Star, ArrowCounterClockwise } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { PurchasesPackage } from 'react-native-purchases';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { useTheme } from '@/providers/ThemeProvider';

const PRO_FEATURES = [
  { icon: '✨', title: 'For You Picks, tuned to you', desc: 'Get matched to your perfect scents from 74,000+ fragrances — the moment you log in' },
  { icon: '👯', title: 'Find your scent twins', desc: 'See up to 100 people with the same taste as you (free users only see 3)' },
  { icon: '♾️', title: 'Unlimited collection', desc: 'Track every bottle you own — free is capped at 5' },
  { icon: '📊', title: 'Deep analytics & shelf view', desc: 'Wear trends, note evolution, seasonal patterns, and a beautiful shelf layout' },
  { icon: '🎯', title: 'Unlimited goals & streaks', desc: 'Set as many fragrance goals as you want — free is capped at 1' },
  { icon: '🤖', title: 'AI scanner & recommendations', desc: 'Scan any bottle, get personalized suggestions, find dupes for niche scents' },
  { icon: '☁️', title: 'Cloud sync across devices', desc: 'Your collection, diary, and stats — always backed up' },
];

const TESTIMONIAL = {
  quote: "Honestly the For You picks alone are worth it. Found 3 new signature scents in my first week.",
  author: 'Maya R.',
  rating: 5,
};

const IOS_MONTHLY_PRODUCT_ID = 'sb_monthly';
const IOS_YEARLY_PRODUCT_ID = 'sb_yearly';

function isAnnualPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_YEARLY_PRODUCT_ID || pkg.identifier === '$rc_annual' || pkg.packageType === 'ANNUAL';
}

function isMonthlyPlan(pkg: PurchasesPackage | null): boolean {
  if (!pkg) return false;
  return pkg.product.identifier === IOS_MONTHLY_PRODUCT_ID || pkg.identifier === '$rc_monthly' || pkg.packageType === 'MONTHLY';
}

function formatPrice(pkg: PurchasesPackage): string {
  const product = pkg.product;
  if (product.priceString) return product.priceString;
  return isAnnualPlan(pkg) ? '$35.95' : '$5.99';
}

function getPeriodLabel(pkg: PurchasesPackage): string {
  if (isAnnualPlan(pkg)) return 'year';
  if (isMonthlyPlan(pkg)) return 'month';
  return 'period';
}

function getSavingsText(packages: PurchasesPackage[]): string | null {
  const annual = packages.find(isAnnualPlan);
  if (!annual) return null;
  return 'Save 50%';
}

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    packages,
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

  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const crownScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.spring(crownScale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, crownScale]);

  useEffect(() => {
    if (packages.length > 0 && !selectedPkg) {
      const annual = packages.find(isAnnualPlan);
      setSelectedPkg(annual ?? packages[0]);
    }
  }, [packages, selectedPkg]);

  useEffect(() => {
    if (isPro) {
      Alert.alert('Welcome to Pro!', 'You now have full access to all Scent Buddy Pro features.', [
        { text: 'Awesome!', onPress: () => router.back() },
      ]);
    }
  }, [isPro, router]);

  const handlePurchase = useCallback(async () => {
    if (!selectedPkg) return;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await purchasePackage(selectedPkg);
    } catch (error: any) {
      if (!error.userCancelled) {
        Alert.alert('Purchase Failed', error.message || 'Something went wrong. Please try again.');
      }
    }
  }, [selectedPkg, purchasePackage]);

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

  const savingsText = getSavingsText(packages);

  const isDark = colors.background === '#0d0b08';
  const gradientTop = isDark ? '#1a1510' : '#faf7f2';
  const goldAccent = '#D4A574';
  const goldLight = '#F5E6D3';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.chip }]}
          onPress={() => router.back()}
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Animated.View style={[styles.crownContainer, { backgroundColor: goldAccent + '15', transform: [{ scale: crownScale }] }]}>
            <Crown size={48} color={goldAccent} weight="fill" />
          </Animated.View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            Discover scents you'll <Text style={{ color: goldAccent }}>actually love</Text>
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>
            Stop guessing. Get AI picks from 74K+ fragrances matched to your taste — plus everything below.
          </Text>
          <View style={styles.socialProofRow}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} size={13} color={goldAccent} weight="fill" />
              ))}
            </View>
            <Text style={[styles.socialProofText, { color: colors.subtext }]}>
              Loved by thousands of fragrance lovers
            </Text>
          </View>
        </Animated.View>

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
                  transform: [{ translateY: Animated.multiply(slideAnim, new Animated.Value(1 + i * 0.15)) }],
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

        <View style={[styles.testimonialCard, { backgroundColor: goldAccent + '10', borderColor: goldAccent + '40' }]}>
          <View style={styles.testimonialStars}>
            {Array.from({ length: TESTIMONIAL.rating }).map((_, i) => (
              <Star key={i} size={14} color={goldAccent} weight="fill" />
            ))}
          </View>
          <Text style={[styles.testimonialQuote, { color: colors.text }]}>
            "{TESTIMONIAL.quote}"
          </Text>
          <Text style={[styles.testimonialAuthor, { color: colors.subtext }]}>
            — {TESTIMONIAL.author}, Pro member
          </Text>
        </View>

        {isLoadingOfferings ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={goldAccent} />
            <Text style={[styles.loadingText, { color: colors.subtext }]}>Loading plans...</Text>
          </View>
        ) : packages.length === 0 ? (
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
            {packages.map((pkg) => {
              const isSelected = selectedPkg?.identifier === pkg.identifier;
              const isAnnual = isAnnualPlan(pkg);
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
                    setSelectedPkg(pkg);
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
                          {isAnnual ? 'Yearly' : 'Monthly'}
                        </Text>
                        {isAnnual && savingsText && (
                          <View style={[styles.savingsBadge, { backgroundColor: goldAccent }]}>
                            <Text style={styles.savingsBadgeText}>{savingsText}</Text>
                          </View>
                        )}
                      </View>

                    </View>
                  </View>
                  <View style={styles.packageRight}>
                    {isAnnual && (
                      <Text style={[styles.anchorPrice, { color: colors.subtext }]}>
                        $71.90
                      </Text>
                    )}
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

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
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
                {isAnnualPlan(selectedPkg) ? 'Get Pro — Save 50%' : 'Get Pro Monthly'}
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
  testimonialCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },
  testimonialStars: {
    flexDirection: 'row' as const,
    gap: 2,
    marginBottom: 8,
  },
  testimonialQuote: {
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic' as const,
    fontWeight: '500' as const,
  },
  testimonialAuthor: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600' as const,
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
    gap: 10,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
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
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
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
