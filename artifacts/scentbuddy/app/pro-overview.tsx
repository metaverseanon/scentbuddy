import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeft,
  Crown,
  LockSimple,
  Check,
  Drop,
  Camera,
  Users,
  Sparkle,
  ChartBar,
  MagnifyingGlass,
  Target,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { usePaywallPrompt } from '@/providers/PaywallPromptProvider';
import { logAnalyticsEvent } from '@/lib/analytics';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

type PreviewKind = 'collection' | 'scan' | 'twins' | 'dna' | 'stats' | 'notes' | 'goals';

type Benefit = {
  key: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  freeNote: string;
  preview: PreviewKind;
};

// Copy is benefit-led and limit claims are factual: real free-tier caps in code
// are collection 5, goals 1, Twin Finder top 3 (Pro up to 100).
const BENEFITS: Benefit[] = [
  {
    key: 'collection',
    icon: Drop,
    title: 'Unlimited collection',
    desc: 'Keep every bottle you own in one tidy wardrobe — nothing left off the shelf.',
    freeNote: 'Free stops at 5 bottles',
    preview: 'collection',
  },
  {
    key: 'scan',
    icon: Camera,
    title: 'Unlimited AI scanning',
    desc: 'Point your camera at any bottle or barcode and add it in seconds.',
    freeNote: 'Free scanning stops at the 5-bottle cap',
    preview: 'scan',
  },
  {
    key: 'twins',
    icon: Users,
    title: 'Full Twin Finder',
    desc: 'See everyone who shares your taste, ranked by how closely you match.',
    freeNote: 'Free shows your top 3 — Pro unlocks up to 100',
    preview: 'twins',
  },
  {
    key: 'dna',
    icon: Sparkle,
    title: 'Full Fragrance DNA',
    desc: 'Unlock longevity, versatility, and seasonal fit in your scent breakdown.',
    freeNote: 'Free hides your deeper insights',
    preview: 'dna',
  },
  {
    key: 'stats',
    icon: ChartBar,
    title: 'Advanced statistics',
    desc: 'Wear trends, note evolution, and seasonal patterns tracked over time.',
    freeNote: 'Free shows the basics only',
    preview: 'stats',
  },
  {
    key: 'notes',
    icon: MagnifyingGlass,
    title: 'Search & discover by note',
    desc: 'Find similar scents and dupes built around the notes you already love.',
    freeNote: 'Unlock with Pro',
    preview: 'notes',
  },
  {
    key: 'goals',
    icon: Target,
    title: 'Unlimited goals',
    desc: 'Set as many fragrance goals and streaks as you want to chase.',
    freeNote: 'Free stops at 1 goal',
    preview: 'goals',
  },
];

function Bar({ width, height, color, radius = 6, style }: { width: number | `${number}%`; height: number; color: string; radius?: number; style?: object }) {
  return <View style={[{ width, height, borderRadius: radius, backgroundColor: color }, style]} />;
}

function renderPreview(kind: PreviewKind, colors: ThemeColors) {
  const soft = colors.border;
  const soft2 = colors.accent + '22';
  switch (kind) {
    case 'collection':
      return (
        <View style={styles.pvRow}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.pvBottle, { backgroundColor: colors.chip, borderColor: colors.border }]}>
              <View style={[styles.pvBottleTop, { backgroundColor: soft2 }]} />
              <Bar width="70%" height={7} color={soft} />
              <Bar width="45%" height={6} color={soft} />
            </View>
          ))}
        </View>
      );
    case 'scan':
      return (
        <View style={styles.pvScan}>
          <View style={[styles.pvScanFrame, { borderColor: colors.accent + '55' }]}>
            <View style={[styles.pvScanBottle, { backgroundColor: soft2 }]} />
          </View>
          <View style={styles.pvScanLines}>
            <Bar width="80%" height={8} color={soft} />
            <Bar width="55%" height={7} color={soft} />
          </View>
        </View>
      );
    case 'twins':
      return (
        <View style={styles.pvList}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.pvTwinRow}>
              <View style={[styles.pvAvatar, { backgroundColor: soft2 }]} />
              <View style={styles.pvTwinText}>
                <Bar width="70%" height={9} color={soft} />
                <Bar width="40%" height={7} color={soft} />
              </View>
              <View style={[styles.pvScore, { backgroundColor: soft2 }]} />
            </View>
          ))}
        </View>
      );
    case 'dna':
      return (
        <View style={styles.pvList}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.pvDnaRow}>
              <Bar width="42%" height={9} color={soft} />
              <Bar width="32%" height={9} color={soft2} />
            </View>
          ))}
        </View>
      );
    case 'stats':
      return (
        <View style={styles.pvChart}>
          {[42, 64, 30, 78, 50, 88].map((h, i) => (
            <View key={i} style={styles.pvBarCol}>
              <Bar width={14} height={h} color={i % 2 === 0 ? soft2 : soft} radius={4} />
            </View>
          ))}
        </View>
      );
    case 'notes':
      return (
        <View style={styles.pvList}>
          <View style={[styles.pvSearchField, { backgroundColor: colors.chip, borderColor: colors.border }]}>
            <MagnifyingGlass size={14} color={colors.subtext} />
            <Bar width="55%" height={8} color={soft} />
          </View>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.pvNoteRow}>
              <View style={[styles.pvChip, { backgroundColor: soft2 }]} />
              <Bar width="60%" height={8} color={soft} />
            </View>
          ))}
        </View>
      );
    case 'goals':
      return (
        <View style={styles.pvList}>
          {[0, 1].map(i => (
            <View key={i} style={styles.pvGoalRow}>
              <View style={[styles.pvGoalIcon, { backgroundColor: soft2 }]} />
              <View style={styles.pvGoalText}>
                <Bar width="65%" height={8} color={soft} />
                <View style={[styles.pvGoalTrack, { backgroundColor: colors.border }]}>
                  <View style={[styles.pvGoalFill, { backgroundColor: soft2, width: i === 0 ? '60%' : '35%' }]} />
                </View>
              </View>
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

function BenefitCard({
  benefit,
  colors,
  isDark,
  lockedState,
  unlockedState,
}: {
  benefit: Benefit;
  colors: ThemeColors;
  isDark: boolean;
  lockedState: boolean;
  unlockedState: boolean;
}) {
  const Icon = benefit.icon;
  return (
    <View style={[styles.benefitCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.benefitHeader}>
        <View style={[styles.benefitIconWrap, { backgroundColor: colors.accent + '15' }]}>
          <Icon size={22} color={colors.accent} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.benefitTitle, { color: colors.text }]}>{benefit.title}</Text>
          <Text style={[styles.benefitDesc, { color: colors.subtext }]}>{benefit.desc}</Text>
        </View>
        {unlockedState && (
          <View style={styles.unlockedPill}>
            <Check size={12} color="#3BA55D" weight="bold" />
            <Text style={styles.unlockedPillText}>Unlocked</Text>
          </View>
        )}
      </View>

      {!unlockedState && (
        <View style={styles.previewWrap}>
          {renderPreview(benefit.preview, colors)}
          {lockedState && (
            <>
              <BlurView intensity={16} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card + 'AA' }]} />
              <View style={styles.lockOverlay}>
                <LockSimple size={18} color={colors.accent} weight="fill" />
                <Text style={[styles.lockText, { color: colors.text }]}>{benefit.freeNote}</Text>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

export default function ProOverviewScreen() {
  const { colors } = useTheme();
  const { isPro, isLoadingCustomerInfo } = useRevenueCat();
  const { openPaywall } = usePaywallPrompt();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string }>();
  const source = params.source ?? 'unknown';

  const isDark = colors.background === '#0d0b08';
  const goldAccent = '#D4A574';
  const proKnown = !isLoadingCustomerInfo;
  const lockedState = proKnown && !isPro;
  const unlockedState = proKnown && isPro;

  const viewLoggedRef = useRef(false);
  useEffect(() => {
    if (viewLoggedRef.current) return;
    if (!proKnown) return;
    viewLoggedRef.current = true;
    void logAnalyticsEvent('pro_overview_viewed', { source, is_pro: isPro });
  }, [proKnown, isPro, source]);

  const handleUpgrade = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void logAnalyticsEvent('pro_overview_cta_tapped', { source });
    // Preserve the originating surface so the paywall funnel keeps entry-point attribution.
    openPaywall(`pro_overview_${source}`);
  }, [openPaywall, source]);

  const heroTitle = unlockedState ? 'Your Pro benefits' : 'Everything you get with Pro';
  const heroSubtitle = unlockedState
    ? 'Your plan is active — everything below is unlocked on your account.'
    : 'See the full picture in one place. Here is what opens up the moment you go Pro.';

  const benefits = useMemo(() => BENEFITS, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[goldAccent + (isDark ? '26' : '1f'), colors.background]}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CaretLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={[styles.crownWrap, { backgroundColor: goldAccent + '1f' }]}>
          <Crown size={34} color={goldAccent} weight="fill" />
        </View>
        <Text style={[styles.heroTitle, { color: colors.text }]}>{heroTitle}</Text>
        <Text style={[styles.heroSubtitle, { color: colors.subtext }]}>{heroSubtitle}</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {benefits.map(benefit => (
          <BenefitCard
            key={benefit.key}
            benefit={benefit}
            colors={colors}
            isDark={isDark}
            lockedState={lockedState}
            unlockedState={unlockedState}
          />
        ))}
      </ScrollView>

      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 14, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {unlockedState ? (
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: colors.chip }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaBtnTextNeutral, { color: colors.text }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.ctaBtn, { backgroundColor: goldAccent }, !proKnown && styles.ctaBtnDisabled]}
            onPress={handleUpgrade}
            activeOpacity={0.85}
            disabled={!proKnown}
          >
            <Crown size={18} color="#1a1410" weight="fill" />
            <Text style={styles.ctaBtnText}>See plans</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 22 },
  backBtn: { marginBottom: 10, alignSelf: 'flex-start' },
  crownWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  benefitCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 14 },
  benefitHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  benefitIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  benefitTitle: { fontSize: 16, fontWeight: '700' },
  benefitDesc: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  unlockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3BA55D18',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unlockedPillText: { fontSize: 11, fontWeight: '800', color: '#3BA55D', letterSpacing: 0.3 },
  previewWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 96,
    justifyContent: 'center',
    padding: 12,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  lockText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pvRow: { flexDirection: 'row', gap: 8 },
  pvBottle: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    gap: 6,
    alignItems: 'center',
  },
  pvBottleTop: { width: 22, height: 30, borderRadius: 5, marginBottom: 2 },
  pvScan: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pvScanFrame: {
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pvScanBottle: { width: 26, height: 40, borderRadius: 6 },
  pvScanLines: { flex: 1, gap: 8 },
  pvList: { gap: 10 },
  pvTwinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pvAvatar: { width: 36, height: 36, borderRadius: 18 },
  pvTwinText: { flex: 1, gap: 6 },
  pvScore: { width: 34, height: 34, borderRadius: 17 },
  pvDnaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pvChart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 92, paddingHorizontal: 4 },
  pvBarCol: { justifyContent: 'flex-end' },
  pvSearchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pvNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pvChip: { width: 44, height: 18, borderRadius: 9 },
  pvGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pvGoalIcon: { width: 30, height: 30, borderRadius: 8 },
  pvGoalText: { flex: 1, gap: 8 },
  pvGoalTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  pvGoalFill: { height: 8, borderRadius: 4 },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 100,
    paddingVertical: 16,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: '#1a1410', fontSize: 16, fontWeight: '800' },
  ctaBtnTextNeutral: { fontSize: 16, fontWeight: '700' },
});
