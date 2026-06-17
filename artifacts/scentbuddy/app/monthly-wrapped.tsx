import React, { useMemo, useRef, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Share as RNShare,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  CaretLeft,
  CaretRight,
  DownloadSimple,
  ShareNetwork,
  Sparkle,
  CalendarBlank,
  LockSimple,
  Crown,
  Moon,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { usePaywallPrompt } from '@/providers/PaywallPromptProvider';
import { supabase } from '@/lib/supabase';
import { logAnalyticsEvent } from '@/lib/analytics';
import { REFERRAL_SHARE_URL, getOrCreateReferralCode } from '@/lib/referrals';
import { CollectionItem, WearDiaryEntry, SCENT_FAMILIES } from '@/lib/types';
import FeatureSpotlight from '@/components/FeatureSpotlight';
import { CalendarHeart, ChartPieSlice, Drop } from 'phosphor-react-native';

type ActionState = 'idle' | 'saving' | 'sharing';

function getMonthRange(offset: number = -1) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(target.getFullYear(), target.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}

export default function MonthlyWrappedScreen() {
  const { user, profile } = useAuth();
  const { isPro } = useRevenueCat();
  const { openPaywall } = usePaywallPrompt();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const params = useLocalSearchParams<{ offset?: string }>();
  const offset = params.offset ? parseInt(params.offset, 10) : -1;
  const { start, end, label } = useMemo(() => getMonthRange(offset), [offset]);

  const goToOffset = useCallback(
    (newOffset: number) => {
      if (newOffset > 0) return;
      Haptics.selectionAsync().catch(() => {});
      router.setParams({ offset: String(newOffset) });
    },
    [router]
  );

  const isCurrentMonth = offset === 0;
  const canGoForward = offset < 0;

  const wearsQuery = useQuery({
    queryKey: ['monthly-wrapped-wears', user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('wear_diary')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start.toISOString().split('T')[0])
        .lte('date', end.toISOString().split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as WearDiaryEntry[];
    },
    enabled: !!user?.id,
  });

  const collectionQuery = useQuery({
    queryKey: ['monthly-wrapped-collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const newAdditionsQuery = useQuery({
    queryKey: ['monthly-wrapped-new', user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const wears = wearsQuery.data ?? [];
  const collection = collectionQuery.data ?? [];
  const newAdditions = newAdditionsQuery.data ?? [];

  const stats = useMemo(() => {
    const wearCounts: Record<string, { name: string; brand: string; count: number }> = {};
    const brandCounts: Record<string, number> = {};
    const familyCounts: Record<string, number> = {};
    let totalNotes = 0;
    const dayWears: Record<string, number> = {};

    wears.forEach(w => {
      const key = `${w.perfume_name}|${w.perfume_brand}`;
      if (!wearCounts[key]) wearCounts[key] = { name: w.perfume_name, brand: w.perfume_brand, count: 0 };
      wearCounts[key].count++;
      brandCounts[w.perfume_brand] = (brandCounts[w.perfume_brand] || 0) + 1;
      dayWears[w.date] = (dayWears[w.date] || 0) + 1;
    });

    const wornNames = new Set(wears.map(w => `${w.perfume_name}|${w.perfume_brand}`));
    collection
      .filter(c => wornNames.has(`${c.perfume_name}|${c.perfume_brand}`))
      .forEach(c => {
        [...(c.top_notes ?? []), ...(c.heart_notes ?? []), ...(c.base_notes ?? [])].forEach(note => {
          const lower = note.toLowerCase();
          SCENT_FAMILIES.forEach(family => {
            if (family.keywords.some(kw => lower.includes(kw))) {
              familyCounts[family.name] = (familyCounts[family.name] || 0) + 1;
              totalNotes++;
            }
          });
        });
      });

    const sortedWears = Object.values(wearCounts).sort((a, b) => b.count - a.count);
    const topThree = sortedWears.slice(0, 3);
    const topBrand = Object.entries(brandCounts).sort(([, a], [, b]) => b - a)[0];
    const topFamily = SCENT_FAMILIES
      .map(f => ({ name: f.name, color: f.color, count: familyCounts[f.name] || 0 }))
      .sort((a, b) => b.count - a.count)[0];

    const families = SCENT_FAMILIES
      .map(f => ({
        name: f.name,
        color: f.color,
        count: familyCounts[f.name] || 0,
        pct: totalNotes > 0 ? Math.round(((familyCounts[f.name] || 0) / totalNotes) * 100) : 0,
      }))
      .filter(f => f.count > 0)
      .sort((a, b) => b.count - a.count);

    const uniqueDays = Object.keys(dayWears).length;
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const consistency = Math.round((uniqueDays / totalDays) * 100);

    const moods: Record<string, string> = {
      Citrus: 'Radiant',
      Floral: 'Romantic',
      Woody: 'Grounded',
      Oriental: 'Magnetic',
      Fresh: 'Effortless',
      Spicy: 'Bold',
      Gourmand: 'Indulgent',
      Leather: 'Rebellious',
    };
    const mood = topFamily ? moods[topFamily.name] ?? 'Distinctive' : 'Mysterious';

    return {
      totalWears: wears.length,
      uniqueFragrances: Object.keys(wearCounts).length,
      uniqueDays,
      consistency,
      topThree,
      topBrand: topBrand ? topBrand[0] : null,
      topBrandCount: topBrand ? topBrand[1] : 0,
      topFamily,
      families,
      mood,
      newAdditions: newAdditions.length,
    };
  }, [wears, collection, newAdditions, start, end]);

  const referralCodeQuery = useQuery({
    queryKey: ['monthly-wrapped-referral-code', user?.id],
    queryFn: async () => (user?.id ? getOrCreateReferralCode(user.id, profile?.username ?? null) : null),
    enabled: !!user?.id,
    staleTime: Infinity,
  });
  const referralCode = referralCodeQuery.data ?? null;
  // For a signed-in user the code resolves quickly but asynchronously; until it
  // settles we must NOT let Save/Share capture a card with the generic join link
  // (an unattributed share). isLoading is false for the disabled (signed-out)
  // query and once the query settles with data OR errors, so signed-out/error
  // cases still degrade gracefully to the generic link.
  const referralLoading = referralCodeQuery.isLoading;
  const joinUrl = referralCode ? `${REFERRAL_SHARE_URL}?ref=${referralCode}` : REFERRAL_SHARE_URL;
  const joinUrlDisplay = joinUrl.replace(/^https?:\/\//, '');

  // Deeper, Pro-only breakdowns derived ENTIRELY from already-queried real data.
  // Rendered below the shareable card; non-Pro users never see the real values.
  const deeperInsights = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    const dayWears: Record<string, number> = {};
    wears.forEach(w => {
      dayWears[w.date] = (dayWears[w.date] || 0) + 1;
    });
    const busiest = Object.entries(dayWears).sort(([, a], [, b]) => b - a)[0];
    if (busiest) {
      const d = new Date(busiest[0] + 'T12:00:00');
      rows.push({
        label: 'Busiest day',
        value: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${busiest[1]}×`,
      });
    }
    if (stats.uniqueDays > 0) {
      rows.push({ label: 'Avg wears / active day', value: (stats.totalWears / stats.uniqueDays).toFixed(1) });
    }
    if (stats.topThree.length > 0 && stats.totalWears > 0) {
      const pct = Math.round((stats.topThree[0].count / stats.totalWears) * 100);
      rows.push({ label: 'Signature share', value: `${pct}% · ${stats.topThree[0].name}` });
    }
    if (collection.length > 0) {
      rows.push({ label: 'Bottles rotated', value: `${stats.uniqueFragrances} of ${collection.length}` });
    }
    if (stats.families.length > 0) {
      rows.push({ label: 'Scent families explored', value: String(stats.families.length) });
    }
    return rows;
  }, [wears, stats, collection]);

  const hasReferralCode = !!referralCode;
  const lockedLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPro || deeperInsights.length === 0) return;
    if (lockedLoggedRef.current === label) return;
    lockedLoggedRef.current = label;
    void logAnalyticsEvent('recap_deeper_insights_locked_viewed', {
      recap_type: 'monthly',
      source: 'monthly_wrapped',
      period_label: label,
      is_pro: isPro,
    });
  }, [isPro, deeperInsights.length, label]);

  const handleUnlockDeeper = useCallback(() => {
    void logAnalyticsEvent('recap_deeper_insights_unlock_tapped', {
      recap_type: 'monthly',
      source: 'monthly_wrapped',
      period_label: label,
      is_pro: isPro,
    });
    openPaywall('monthly_wrapped_deeper_insights');
  }, [openPaywall, label, isPro]);

  const handleSeeProOverview = useCallback(() => {
    void logAnalyticsEvent('recap_deeper_insights_pro_overview_tapped', {
      recap_type: 'monthly',
      source: 'monthly_wrapped',
      period_label: label,
      is_pro: isPro,
    });
    router.push({ pathname: '/pro-overview', params: { source: 'monthly_wrapped' } } as never);
  }, [router, label, isPro]);

  const handleCapture = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
      return uri;
    } catch {
      return null;
    }
  }, []);

  const handleDownload = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionState('saving');
    try {
      const uri = await handleCapture();
      if (!uri) {
        Alert.alert('Oops', 'Could not capture your wrapped card. Try again.');
        return;
      }
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = uri;
        a.download = `scentbuddy-wrapped-${label.replace(/\s/g, '-')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        void logAnalyticsEvent('recap_card_saved', {
          recap_type: 'monthly',
          source: 'monthly_wrapped',
          period_label: label,
          is_pro: isPro,
        });
        return;
      }
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to save your wrapped card.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void logAnalyticsEvent('recap_card_saved', {
        recap_type: 'monthly',
        source: 'monthly_wrapped',
        period_label: label,
        is_pro: isPro,
      });
      Alert.alert('Saved!', 'Your Fragrance Wrapped was saved to your photo library.');
    } catch {
      Alert.alert('Error', 'Could not save the card. Try again.');
    } finally {
      setActionState('idle');
    }
  }, [handleCapture, label, isPro]);

  const handleShare = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionState('sharing');
    const baseProps = {
      recap_type: 'monthly' as const,
      source: 'monthly_wrapped' as const,
      period_label: label,
      is_pro: isPro,
      total_wears: stats.totalWears,
      unique_fragrances: stats.uniqueFragrances,
      has_referral_code: hasReferralCode,
    };
    void logAnalyticsEvent('recap_share_started', baseProps);
    try {
      const uri = await handleCapture();
      if (!uri) {
        void logAnalyticsEvent('recap_share_failed', { ...baseProps, reason: 'capture_failed' });
        Alert.alert('Oops', 'Could not capture your wrapped card. Try again.');
        return;
      }
      const message = `My ${label} in fragrance — ${stats.totalWears} wears, ${stats.uniqueFragrances} bottles, vibe: ${stats.mood}. Track yours on ScentBuddy → ${joinUrl}`;
      if (Platform.OS === 'web') {
        await RNShare.share({ message });
        void logAnalyticsEvent('recap_share_completed', { ...baseProps, method: 'web' });
        return;
      }
      const shareUrl = uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
      await RNShare.share({ message, url: shareUrl });
      void logAnalyticsEvent('recap_share_completed', {
        ...baseProps,
        method: 'rn_share',
        has_image: Platform.OS === 'ios',
      });
    } catch {
      void logAnalyticsEvent('recap_share_failed', { ...baseProps, reason: 'share_threw' });
    } finally {
      setActionState('idle');
    }
  }, [handleCapture, label, stats, isPro, joinUrl, hasReferralCode]);

  if (wearsQuery.isLoading || collectionQuery.isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#c49a6c" style={{ marginTop: 80 }} />
      </View>
    );
  }

  const displayName =
    profile?.username || profile?.display_name || user?.email?.split('@')[0] || 'You';

  const monthSwitcher = (
    <View style={styles.monthSwitcher}>
      <TouchableOpacity
        onPress={() => goToOffset(offset - 1)}
        style={styles.monthSwitcherBtn}
        accessibilityLabel="Previous month"
      >
        <CaretLeft size={16} color="#f0ebe5" weight="bold" />
      </TouchableOpacity>
      <View style={styles.monthSwitcherLabelWrap}>
        <Text style={styles.monthSwitcherLabel}>{label}</Text>
        {isCurrentMonth ? (
          <Text style={styles.monthSwitcherSub}>This month so far</Text>
        ) : null}
      </View>
      <TouchableOpacity
        onPress={() => canGoForward && goToOffset(offset + 1)}
        style={[styles.monthSwitcherBtn, !canGoForward && styles.monthSwitcherBtnDisabled]}
        disabled={!canGoForward}
        accessibilityLabel="Next month"
      >
        <CaretRight size={16} color={canGoForward ? '#f0ebe5' : '#5a4a48'} weight="bold" />
      </TouchableOpacity>
    </View>
  );

  const spotlight = (
    <FeatureSpotlight
      storageKey="monthly_wrapped"
      icon={CalendarHeart}
      iconColor="#E8A838"
      gradientColors={['#1f1408', '#160e05', '#241808']}
      title="Your fragrance month, wrapped"
      subtitle="A Spotify-Wrapped-style recap of how you wore your collection — fresh on the 1st of every month."
      bullets={[
        { icon: Drop, text: 'Most-worn bottles, top houses, and your scent vibe.' },
        { icon: ChartPieSlice, text: 'See your wear streak, new additions, and family palette.' },
        { icon: ShareNetwork, text: 'Save the card or share it straight to socials.' },
      ]}
    />
  );

  if (stats.totalWears === 0 && newAdditions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: '#0d0b08' }]}>
        {spotlight}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <CaretLeft size={22} color="#f0ebe5" weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{label} Wrapped</Text>
          <View style={{ width: 40 }} />
        </View>
        {monthSwitcher}
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Moon size={40} color="#c49a6c" weight="fill" />
          </View>
          <Text style={styles.emptyTitle}>
            {isCurrentMonth ? 'Nothing logged yet' : 'A quiet month'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {isCurrentMonth
              ? `Start logging wears in ${label} and we'll wrap them up for you in real time.`
              : `We didn't see any wears or additions logged for ${label}. Try another month with the arrows above.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {spotlight}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <CaretLeft size={22} color="#f0ebe5" weight="bold" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fragrance Wrapped</Text>
        <View style={{ width: 40 }} />
      </View>
      {monthSwitcher}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 140, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View collapsable={false} ref={cardRef} style={styles.cardWrapper}>
          <LinearGradient
            colors={['#1a0a1a', '#0d0510', '#1c0820']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['#e8709040', 'transparent']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.orbTopRight} />
          <View style={styles.orbBottomLeft} />

          <View style={styles.cardInner}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Sparkle size={12} color="#0d0510" weight="fill" />
              </View>
              <Text style={styles.brandText}>SCENTBUDDY</Text>
              <View style={styles.brandDivider} />
              <Text style={styles.brandYear}>WRAPPED</Text>
            </View>

            <Text style={styles.nameText}>{displayName}</Text>
            <Text style={styles.heroTitle}>{label.split(' ')[0].toUpperCase()}</Text>
            <Text style={styles.heroTitleAccent}>{label.split(' ')[1]}</Text>

            <View style={styles.taglinePill}>
              <CalendarBlank size={12} color="#e8d8c0" />
              <Text style={styles.taglineText}>{stats.totalWears} wears across {stats.uniqueDays} days</Text>
            </View>

            <View style={styles.bigStatRow}>
              <View style={styles.bigStatBlock}>
                <Text style={styles.bigStatValue}>{stats.totalWears}</Text>
                <Text style={styles.bigStatLabel}>WEARS</Text>
              </View>
              <View style={styles.bigStatDivider} />
              <View style={styles.bigStatBlock}>
                <Text style={styles.bigStatValue}>{stats.uniqueFragrances}</Text>
                <Text style={styles.bigStatLabel}>BOTTLES</Text>
              </View>
              <View style={styles.bigStatDivider} />
              <View style={styles.bigStatBlock}>
                <Text style={styles.bigStatValue}>{stats.consistency}%</Text>
                <Text style={styles.bigStatLabel}>STREAK</Text>
              </View>
            </View>

            {stats.topThree.length > 0 && (
              <View style={styles.podiumSection}>
                <Text style={styles.sectionLabel}>YOUR PODIUM</Text>
                {stats.topThree.map((p, i) => (
                  <View key={`${p.name}-${i}`} style={styles.podiumRow}>
                    <Text style={[styles.podiumRank, { color: i === 0 ? '#e87090' : '#c49a6c' }]}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.podiumName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.podiumBrand} numberOfLines={1}>{p.brand}</Text>
                    </View>
                    <Text style={styles.podiumCount}>{p.count}×</Text>
                  </View>
                ))}
              </View>
            )}

            {stats.families.length > 0 && (
              <View style={styles.familySection}>
                <Text style={styles.sectionLabel}>YOUR PALETTE</Text>
                <View style={styles.familyBar}>
                  {stats.families.map((f, idx) => (
                    <View
                      key={f.name}
                      style={{
                        flex: f.count,
                        height: '100%',
                        backgroundColor: f.color,
                        borderTopLeftRadius: idx === 0 ? 8 : 0,
                        borderBottomLeftRadius: idx === 0 ? 8 : 0,
                        borderTopRightRadius: idx === stats.families.length - 1 ? 8 : 0,
                        borderBottomRightRadius: idx === stats.families.length - 1 ? 8 : 0,
                      }}
                    />
                  ))}
                </View>
                <View style={styles.familyLegend}>
                  {stats.families.slice(0, 3).map(f => (
                    <View key={f.name} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: f.color }]} />
                      <Text style={styles.legendText}>{f.name} <Text style={styles.legendPct}>{f.pct}%</Text></Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.metaGrid}>
              {stats.topBrand && (
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>HOUSE OF THE MONTH</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>{stats.topBrand}</Text>
                  <Text style={styles.metaSub}>{stats.topBrandCount} wears</Text>
                </View>
              )}
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>YOUR VIBE</Text>
                <Text style={[styles.metaValue, { color: stats.topFamily?.color ?? '#e87090' }]} numberOfLines={1}>{stats.mood}</Text>
                <Text style={styles.metaSub}>{stats.topFamily?.name ?? '—'}</Text>
              </View>
              {stats.newAdditions > 0 && (
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>NEW BOTTLES</Text>
                  <Text style={styles.metaValue}>+{stats.newAdditions}</Text>
                  <Text style={styles.metaSub}>added</Text>
                </View>
              )}
            </View>

            <View style={styles.footer}>
              <View style={styles.footerDivider} />
              <View style={styles.footerRow}>
                <Text style={styles.footerBrand}>SCENTBUDDY · {label.toUpperCase()}</Text>
                <Text style={styles.footerCta}>Wrap yours →</Text>
              </View>
              <Text style={styles.footerJoin}>{joinUrlDisplay}</Text>
            </View>
          </View>
        </View>

        {deeperInsights.length > 0 && (
          <View style={styles.deeperSection}>
            <View style={styles.deeperHeader}>
              <Text style={styles.deeperTitle}>Deeper insights</Text>
              {!isPro && (
                <View style={styles.deeperProTag}>
                  <Crown size={11} color="#0d0905" weight="fill" />
                  <Text style={styles.deeperProTagText}>PRO</Text>
                </View>
              )}
            </View>
            <View style={styles.deeperCard}>
              {deeperInsights.map((row, i) => (
                <View
                  key={row.label}
                  style={[styles.insightRow, i === deeperInsights.length - 1 && styles.insightRowLast]}
                >
                  <Text style={styles.insightLabel}>{row.label}</Text>
                  <Text style={styles.insightValue} numberOfLines={1}>
                    {isPro ? row.value : '••••••'}
                  </Text>
                </View>
              ))}
              {!isPro && (
                <>
                  <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
                  <View style={styles.insightLockOverlay}>
                    <LockSimple size={22} color="#f0ebe5" weight="fill" />
                    <Text style={styles.insightLockText}>
                      Unlock your full {label} breakdown with ScentBuddy Pro
                    </Text>
                    <TouchableOpacity
                      style={styles.insightUnlockBtn}
                      onPress={handleUnlockDeeper}
                      accessibilityLabel="Unlock deeper insights with Pro"
                    >
                      <Text style={styles.insightUnlockBtnText}>Unlock with Pro</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.insightSeeAllBtn} onPress={handleSeeProOverview}>
                      <Text style={styles.insightSeeAllText}>See everything in Pro</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 14 }]}>
        <LinearGradient
          colors={['#0d0b0800', '#0d0b08ee', '#0d0b08']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGhost, referralLoading && styles.actionBtnLoading]}
          onPress={handleDownload}
          disabled={actionState !== 'idle' || referralLoading}
          accessibilityLabel="Save Wrapped card"
          activeOpacity={0.85}
        >
          {actionState === 'saving' || referralLoading ? (
            <ActivityIndicator color="#e87090" size="small" />
          ) : (
            <>
              <DownloadSimple size={18} color="#e87090" weight="bold" />
              <Text style={styles.actionBtnGhostText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnPrimary, referralLoading && styles.actionBtnLoading]}
          onPress={handleShare}
          disabled={actionState !== 'idle' || referralLoading}
          accessibilityLabel="Share Wrapped card"
          activeOpacity={0.85}
        >
          {actionState === 'sharing' || referralLoading ? (
            <ActivityIndicator color="#0d0510" size="small" />
          ) : (
            <>
              <ShareNetwork size={18} color="#0d0510" weight="bold" />
              <Text style={styles.actionBtnPrimaryText}>Share Wrapped</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0b08' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1018' },
  headerTitle: { flex: 1, textAlign: 'center', color: '#f0ebe5', fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  monthSwitcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  monthSwitcherBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1018', borderWidth: 1, borderColor: '#2a1a28' },
  monthSwitcherBtnDisabled: { opacity: 0.4 },
  monthSwitcherLabelWrap: { alignItems: 'center', minWidth: 160 },
  monthSwitcherLabel: { color: '#f0ebe5', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  monthSwitcherSub: { color: '#c49a6c', fontSize: 11, fontWeight: '500', marginTop: 2, letterSpacing: 0.3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a0e18',
    borderWidth: 1,
    borderColor: '#e8709022',
  },
  emptyTitle: { color: '#f0ebe5', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: '#a08a78', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  cardWrapper: {
    marginHorizontal: 16,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8709033',
    shadowColor: '#e87090',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 40,
    elevation: 10,
  },
  cardInner: { padding: 24, paddingTop: 28 },
  orbTopRight: { position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: 120, backgroundColor: '#e87090', opacity: 0.12 },
  orbBottomLeft: { position: 'absolute', bottom: -100, left: -100, width: 280, height: 280, borderRadius: 140, backgroundColor: '#c49a6c', opacity: 0.1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#e87090', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#e87090', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  brandDivider: { width: 1, height: 10, backgroundColor: '#e8709055' },
  brandYear: { color: '#a8809a', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  nameText: { color: '#e87090', fontSize: 13, fontWeight: '600', marginTop: 18, letterSpacing: 1.5, textTransform: 'uppercase' },
  heroTitle: { color: '#f0ebe5', fontSize: 44, fontWeight: '900', letterSpacing: -1, marginTop: 4, lineHeight: 46 },
  heroTitleAccent: { color: '#e87090', fontSize: 44, fontWeight: '900', letterSpacing: -1, lineHeight: 46, fontStyle: 'italic' },
  taglinePill: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: '#e8709015',
    borderWidth: 1,
    borderColor: '#e8709040',
  },
  taglineText: { color: '#e8d8c0', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  sectionLabel: { color: '#a8809a', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  bigStatRow: { flexDirection: 'row', marginTop: 22, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8709022' },
  bigStatBlock: { flex: 1, alignItems: 'center' },
  bigStatValue: { color: '#f0ebe5', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  bigStatLabel: { color: '#a8809a', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  bigStatDivider: { width: 1, backgroundColor: '#e8709022' },
  podiumSection: { marginTop: 22 },
  podiumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  podiumRank: { fontSize: 24, fontWeight: '900', width: 24, textAlign: 'center' },
  podiumName: { color: '#f0ebe5', fontSize: 14, fontWeight: '700' },
  podiumBrand: { color: '#a8809a', fontSize: 12, marginTop: 1 },
  podiumCount: { color: '#e87090', fontSize: 14, fontWeight: '800' },
  familySection: { marginTop: 22 },
  familyBar: { flexDirection: 'row', height: 14, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1a1018' },
  familyLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: '#d8c8d0', fontSize: 11, fontWeight: '600' },
  legendPct: { color: '#a8809a', fontWeight: '700' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  metaCard: { flex: 1, minWidth: 100, backgroundColor: '#1a0e18', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e8709022' },
  metaLabel: { color: '#a8809a', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  metaValue: { color: '#f0ebe5', fontSize: 16, fontWeight: '800', marginTop: 6 },
  metaSub: { color: '#a8809a', fontSize: 11, fontWeight: '600', marginTop: 2 },
  footer: { marginTop: 24 },
  footerDivider: { height: 1, backgroundColor: '#e8709022', marginBottom: 12 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerBrand: { color: '#a8809a', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  footerCta: { color: '#e87090', fontSize: 11, fontWeight: '700' },
  footerJoin: { color: '#c49a6c', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 8 },
  deeperSection: { marginHorizontal: 16, marginTop: 22 },
  deeperHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  deeperTitle: { color: '#f0ebe5', fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  deeperProTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#c49a6c',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  deeperProTagText: { color: '#0d0905', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  deeperCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#14100a',
    borderWidth: 1,
    borderColor: '#2a2318',
    minHeight: 150,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2318',
    gap: 12,
  },
  insightRowLast: { borderBottomWidth: 0 },
  insightLabel: { color: '#8b7a68', fontSize: 13, fontWeight: '600' },
  insightValue: { color: '#e8d8c0', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  insightLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  insightLockText: { color: '#f0ebe5', fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18 },
  insightUnlockBtn: {
    backgroundColor: '#c49a6c',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 100,
    marginTop: 2,
  },
  insightUnlockBtnText: { color: '#0d0905', fontSize: 14, fontWeight: '800' },
  insightSeeAllBtn: { marginTop: 6, paddingVertical: 4 },
  insightSeeAllText: { color: '#c49a6c', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 10,
  },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 100 },
  actionBtnGhost: { backgroundColor: '#1a0e18', borderWidth: 1, borderColor: '#e8709040' },
  actionBtnGhostText: { color: '#e87090', fontSize: 14, fontWeight: '700' },
  actionBtnPrimary: { backgroundColor: '#e87090', flex: 1.5 },
  actionBtnPrimaryText: { color: '#0d0510', fontSize: 14, fontWeight: '800' },
  actionBtnLoading: { opacity: 0.6 },
});
