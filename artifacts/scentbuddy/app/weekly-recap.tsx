import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  Alert,
  Share as RNShare,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import {
  CaretLeft,
  Drop,
  Star,
  CalendarBlank,
  Sparkle,
  PlusCircle,
  Heart,
  Flower,
  ShareNetwork,
  DownloadSimple,
  LockSimple,
  Crown,
} from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { usePaywallPrompt } from '@/providers/PaywallPromptProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { logAnalyticsEvent } from '@/lib/analytics';
import { REFERRAL_SHARE_URL, getOrCreateReferralCode } from '@/lib/referrals';
import { WearDiaryEntry, CollectionItem, WishlistItem } from '@/lib/types';

type ActionState = 'idle' | 'saving' | 'sharing';

function getWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function WeeklyRecapScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const { isPro } = useRevenueCat();
  const { openPaywall } = usePaywallPrompt();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [actionState, setActionState] = useState<ActionState>('idle');
  const { start, end } = getWeekRange();
  const periodLabel = `${formatDate(start)} – ${formatDate(end)}`;

  const wearsQuery = useQuery({
    queryKey: ['weekly-recap-wears', user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('wear_diary')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start.toISOString().split('T')[0])
        .lte('date', end.toISOString().split('T')[0])
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WearDiaryEntry[];
    },
    enabled: !!user?.id,
  });

  const newCollectionQuery = useQuery({
    queryKey: ['weekly-recap-collection', user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(item => ({
        ...item,
        status: item.status || 'owned',
        fill_level: item.fill_level ?? 100,
      })) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const newWishlistQuery = useQuery({
    queryKey: ['weekly-recap-wishlist', user?.id, start.toISOString()],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_wishlists')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WishlistItem[];
    },
    enabled: !!user?.id,
  });

  const isLoading = wearsQuery.isLoading || newCollectionQuery.isLoading || newWishlistQuery.isLoading;

  const wears = wearsQuery.data ?? [];
  const newCollection = newCollectionQuery.data ?? [];
  const newWishlist = newWishlistQuery.data ?? [];

  const stats = useMemo(() => {
    const uniqueDays = new Set(wears.map(w => w.date)).size;
    const uniqueFragrances = new Set(wears.map(w => `${w.perfume_name}|${w.perfume_brand}`)).size;

    const wearCounts: Record<string, { name: string; brand: string; image_url: string | null; count: number; totalRating: number; ratingCount: number }> = {};
    for (const w of wears) {
      const key = `${w.perfume_name}|${w.perfume_brand}`;
      if (!wearCounts[key]) {
        wearCounts[key] = { name: w.perfume_name, brand: w.perfume_brand, image_url: w.image_url, count: 0, totalRating: 0, ratingCount: 0 };
      }
      wearCounts[key].count++;
      if (w.rating) {
        wearCounts[key].totalRating += w.rating;
        wearCounts[key].ratingCount++;
      }
    }
    const sorted = Object.values(wearCounts).sort((a, b) => b.count - a.count);
    const mostWorn = sorted[0] ?? null;

    const avgRating = wears.filter(w => w.rating).reduce((sum, w) => sum + (w.rating ?? 0), 0) / (wears.filter(w => w.rating).length || 1);

    return { uniqueDays, uniqueFragrances, mostWorn, avgRating: wears.some(w => w.rating) ? avgRating : null };
  }, [wears]);

  const referralCodeQuery = useQuery({
    queryKey: ['weekly-recap-referral-code', user?.id],
    queryFn: async () => (user?.id ? getOrCreateReferralCode(user.id, profile?.username ?? null) : null),
    enabled: !!user?.id,
    staleTime: Infinity,
  });
  const referralCode = referralCodeQuery.data ?? null;
  const hasReferralCode = !!referralCode;
  const joinUrl = referralCode ? `${REFERRAL_SHARE_URL}?ref=${referralCode}` : REFERRAL_SHARE_URL;
  const joinUrlDisplay = joinUrl.replace(/^https?:\/\//, '');

  const displayName =
    profile?.username || profile?.display_name || user?.email?.split('@')[0] || 'You';

  // Deeper, Pro-only breakdowns from already-queried real data. Non-Pro never sees real values.
  const deeperInsights = useMemo(() => {
    const rows: { label: string; value: string }[] = [];
    const dayWears: Record<string, number> = {};
    const occasions: Record<string, number> = {};
    const moods: Record<string, number> = {};
    wears.forEach(w => {
      dayWears[w.date] = (dayWears[w.date] || 0) + 1;
      if (w.occasion) occasions[w.occasion] = (occasions[w.occasion] || 0) + 1;
      if (w.mood) moods[w.mood] = (moods[w.mood] || 0) + 1;
    });
    const busiest = Object.entries(dayWears).sort(([, a], [, b]) => b - a)[0];
    if (busiest) {
      const d = new Date(busiest[0] + 'T12:00:00');
      rows.push({ label: 'Busiest day', value: `${d.toLocaleDateString('en-US', { weekday: 'long' })} · ${busiest[1]}×` });
    }
    if (stats.uniqueDays > 0) {
      rows.push({ label: 'Avg wears / active day', value: (wears.length / stats.uniqueDays).toFixed(1) });
    }
    const topOcc = Object.entries(occasions).sort(([, a], [, b]) => b - a)[0];
    if (topOcc) rows.push({ label: 'Top occasion', value: topOcc[0] });
    const topMood = Object.entries(moods).sort(([, a], [, b]) => b - a)[0];
    if (topMood) rows.push({ label: 'Top mood', value: topMood[0] });
    return rows;
  }, [wears, stats]);

  const lockedLoggedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPro || deeperInsights.length === 0) return;
    if (lockedLoggedRef.current === periodLabel) return;
    lockedLoggedRef.current = periodLabel;
    void logAnalyticsEvent('recap_deeper_insights_locked_viewed', {
      recap_type: 'weekly',
      source: 'weekly_recap',
      period_label: periodLabel,
      is_pro: isPro,
    });
  }, [isPro, deeperInsights.length, periodLabel]);

  const handleUnlockDeeper = useCallback(() => {
    void logAnalyticsEvent('recap_deeper_insights_unlock_tapped', {
      recap_type: 'weekly',
      source: 'weekly_recap',
      period_label: periodLabel,
      is_pro: isPro,
    });
    openPaywall('weekly_recap_deeper_insights');
  }, [openPaywall, periodLabel, isPro]);

  const handleSeeProOverview = useCallback(() => {
    void logAnalyticsEvent('recap_deeper_insights_pro_overview_tapped', {
      recap_type: 'weekly',
      source: 'weekly_recap',
      period_label: periodLabel,
      is_pro: isPro,
    });
    router.push({ pathname: '/pro-overview', params: { source: 'weekly_recap' } } as never);
  }, [router, periodLabel, isPro]);

  const handleCapture = useCallback(async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    try {
      return await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
      });
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
        Alert.alert('Oops', 'Could not capture your recap card. Try again.');
        return;
      }
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = uri;
        a.download = `scentbuddy-weekly-recap.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        void logAnalyticsEvent('recap_card_saved', {
          recap_type: 'weekly',
          source: 'weekly_recap',
          period_label: periodLabel,
          is_pro: isPro,
        });
        return;
      }
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to save your recap card.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void logAnalyticsEvent('recap_card_saved', {
        recap_type: 'weekly',
        source: 'weekly_recap',
        period_label: periodLabel,
        is_pro: isPro,
      });
      Alert.alert('Saved!', 'Your Weekly Recap was saved to your photo library.');
    } catch {
      Alert.alert('Error', 'Could not save the card. Try again.');
    } finally {
      setActionState('idle');
    }
  }, [handleCapture, periodLabel, isPro]);

  const handleShare = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionState('sharing');
    const baseProps = {
      recap_type: 'weekly' as const,
      source: 'weekly_recap' as const,
      period_label: periodLabel,
      is_pro: isPro,
      total_wears: wears.length,
      unique_fragrances: stats.uniqueFragrances,
      has_referral_code: hasReferralCode,
    };
    void logAnalyticsEvent('recap_share_started', baseProps);
    try {
      const uri = await handleCapture();
      if (!uri) {
        void logAnalyticsEvent('recap_share_failed', { ...baseProps, reason: 'capture_failed' });
        Alert.alert('Oops', 'Could not capture your recap card. Try again.');
        return;
      }
      const message = `My fragrance week (${periodLabel}) — ${wears.length} wears across ${stats.uniqueFragrances} scents. Track yours on ScentBuddy → ${joinUrl}`;
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
  }, [handleCapture, periodLabel, isPro, wears.length, stats.uniqueFragrances, hasReferralCode, joinUrl]);

  const isEmpty = wears.length === 0 && newCollection.length === 0 && newWishlist.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.accent + '22', colors.background]}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <CaretLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={[styles.weekLabel, { color: colors.subtext }]}>
            {formatDate(start)} – {formatDate(end)}
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>Your Weekly Recap</Text>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : isEmpty ? (
        <View style={styles.emptyState}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Flower size={40} color={colors.accent} weight="fill" />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity this week</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtext }]}>Start logging your wears and adding to your collection to see your weekly recap.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View collapsable={false} ref={cardRef} style={styles.shareCard}>
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
            <View style={styles.shareOrb} />
            <View style={styles.shareCardInner}>
              <View style={styles.shareBrandRow}>
                <View style={styles.shareBrandMark}>
                  <Sparkle size={11} color="#0d0510" weight="fill" />
                </View>
                <Text style={styles.shareBrandText}>SCENTBUDDY</Text>
                <View style={styles.shareBrandDivider} />
                <Text style={styles.shareBrandYear}>WEEKLY</Text>
              </View>
              <Text style={styles.shareName}>{displayName}</Text>
              <Text style={styles.shareWeek}>{periodLabel}</Text>
              <View style={styles.shareStatRow}>
                <View style={styles.shareStatBlock}>
                  <Text style={styles.shareStatValue}>{wears.length}</Text>
                  <Text style={styles.shareStatLabel}>WEARS</Text>
                </View>
                <View style={styles.shareStatDivider} />
                <View style={styles.shareStatBlock}>
                  <Text style={styles.shareStatValue}>{stats.uniqueFragrances}</Text>
                  <Text style={styles.shareStatLabel}>SCENTS</Text>
                </View>
                <View style={styles.shareStatDivider} />
                <View style={styles.shareStatBlock}>
                  <Text style={styles.shareStatValue}>{stats.uniqueDays}</Text>
                  <Text style={styles.shareStatLabel}>DAYS</Text>
                </View>
              </View>
              {stats.mostWorn && (
                <View style={styles.shareMostWorn}>
                  <Text style={styles.shareMostWornLabel}>MOST WORN</Text>
                  <Text style={styles.shareMostWornName} numberOfLines={1}>{stats.mostWorn.name}</Text>
                  <Text style={styles.shareMostWornBrand} numberOfLines={1}>
                    {stats.mostWorn.brand} · {stats.mostWorn.count}×
                  </Text>
                </View>
              )}
              <View style={styles.shareCardFooter}>
                <Text style={styles.shareCardFooterBrand}>SCENTBUDDY</Text>
                <Text style={styles.shareCardFooterJoin}>{joinUrlDisplay}</Text>
              </View>
            </View>
          </View>

          <View style={styles.shareActions}>
            <TouchableOpacity
              style={styles.shareActionBtn}
              onPress={handleDownload}
              disabled={actionState !== 'idle'}
              accessibilityLabel="Save recap card"
            >
              {actionState === 'saving' ? (
                <ActivityIndicator color="#0d0905" />
              ) : (
                <>
                  <DownloadSimple size={18} color="#0d0905" weight="bold" />
                  <Text style={styles.shareActionText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shareActionBtn}
              onPress={handleShare}
              disabled={actionState !== 'idle'}
              accessibilityLabel="Share recap card"
            >
              {actionState === 'sharing' ? (
                <ActivityIndicator color="#0d0905" />
              ) : (
                <>
                  <ShareNetwork size={18} color="#0d0905" weight="bold" />
                  <Text style={styles.shareActionText}>Share</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <StatCard label="Wears" value={String(wears.length)} icon={<Drop size={18} color={colors.accent} weight="fill" />} colors={colors} />
            <StatCard label="Fragrances" value={String(stats.uniqueFragrances)} icon={<Sparkle size={18} color={colors.accent} weight="fill" />} colors={colors} />
            <StatCard label="Days Active" value={String(stats.uniqueDays)} icon={<CalendarBlank size={18} color={colors.accent} weight="fill" />} colors={colors} />
            {stats.avgRating !== null && (
              <StatCard label="Avg Rating" value={stats.avgRating.toFixed(1)} icon={<Star size={18} color={colors.accent} weight="fill" />} colors={colors} />
            )}
          </View>

          {stats.mostWorn && (
            <View style={[styles.mostWornCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.mostWornHeader}>
                <View style={styles.mostWornLabelRow}>
                  <Star size={13} color={colors.accent} weight="fill" />
                  <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Most Worn This Week</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: colors.accent + '22' }]}>
                  <Text style={[styles.badgeText, { color: colors.accent }]}>{stats.mostWorn.count}×</Text>
                </View>
              </View>
              <View style={styles.mostWornContent}>
                {stats.mostWorn.image_url ? (
                  <Image
                    source={{ uri: forceHttps(stats.mostWorn.image_url) ?? undefined }}
                    style={styles.mostWornImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={[styles.mostWornImagePlaceholder, { backgroundColor: colors.chip }]}>
                    <Drop size={28} color={colors.subtext} weight="fill" />
                  </View>
                )}
                <View style={styles.mostWornInfo}>
                  <Text style={[styles.mostWornName, { color: colors.text }]} numberOfLines={2}>{stats.mostWorn.name}</Text>
                  <Text style={[styles.mostWornBrand, { color: colors.subtext }]}>{stats.mostWorn.brand}</Text>
                </View>
              </View>
            </View>
          )}

          {wears.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Wear Diary</Text>
              {wears.map((wear, i) => (
                <View key={wear.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.wearRow}>
                    {wear.image_url ? (
                      <Image
                        source={{ uri: forceHttps(wear.image_url) ?? undefined }}
                        style={styles.wearImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.wearImagePlaceholder, { backgroundColor: colors.chip }]}>
                        <Drop size={16} color={colors.subtext} weight="fill" />
                      </View>
                    )}
                    <View style={styles.wearInfo}>
                      <Text style={[styles.wearName, { color: colors.text }]} numberOfLines={1}>{wear.perfume_name}</Text>
                      <Text style={[styles.wearBrand, { color: colors.subtext }]} numberOfLines={1}>{wear.perfume_brand}</Text>
                      <View style={styles.wearMeta}>
                        <Text style={[styles.wearDate, { color: colors.subtext }]}>{formatDay(wear.date)}</Text>
                        {wear.occasion ? <Text style={[styles.wearTag, { backgroundColor: colors.chip, color: colors.subtext }]}>{wear.occasion}</Text> : null}
                        {wear.mood ? <Text style={[styles.wearTag, { backgroundColor: colors.chip, color: colors.subtext }]}>{wear.mood}</Text> : null}
                      </View>
                      {wear.rating ? (
                        <View style={styles.ratingRow}>
                          {Array.from({ length: 5 }).map((_, ri) => (
                            <Star key={ri} size={11} color={ri < wear.rating! ? colors.accent : colors.border} weight={ri < wear.rating! ? 'fill' : 'regular'} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {newCollection.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionTitleRow}>
                <PlusCircle size={16} color={colors.accent} weight="fill" />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Added to Collection</Text>
              </View>
              {newCollection.map((item, i) => (
                <View key={item.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.wearRow}>
                    {item.image_url ? (
                      <Image
                        source={{ uri: forceHttps(item.image_url) ?? undefined }}
                        style={styles.wearImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.wearImagePlaceholder, { backgroundColor: colors.chip }]}>
                        <Drop size={16} color={colors.subtext} weight="fill" />
                      </View>
                    )}
                    <View style={styles.wearInfo}>
                      <Text style={[styles.wearName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                      <Text style={[styles.wearBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                      {item.concentration ? <Text style={[styles.wearDate, { color: colors.subtext }]}>{item.concentration}</Text> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {newWishlist.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sectionTitleRow}>
                <Heart size={16} color={colors.accent} weight="fill" />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Added to Wishlist</Text>
              </View>
              {newWishlist.map((item, i) => (
                <View key={item.id}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                  <View style={styles.wearRow}>
                    {item.image_url ? (
                      <Image
                        source={{ uri: forceHttps(item.image_url) ?? undefined }}
                        style={styles.wearImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={[styles.wearImagePlaceholder, { backgroundColor: colors.chip }]}>
                        <Heart size={16} color={colors.subtext} weight="fill" />
                      </View>
                    )}
                    <View style={styles.wearInfo}>
                      <Text style={[styles.wearName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                      <Text style={[styles.wearBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                      {item.estimated_price ? <Text style={[styles.wearDate, { color: colors.subtext }]}>{item.estimated_price}</Text> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
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
                        Unlock your full weekly breakdown with ScentBuddy Pro
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
      )}
    </View>
  );
}

function StatCard({ label, value, icon, colors }: { label: string; value: string; icon: React.ReactNode; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {icon}
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.subtext }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  headerContent: { gap: 4 },
  weekLabel: { fontSize: 13, fontWeight: '500' },
  title: { fontSize: 26, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard: {
    flex: 1,
    minWidth: 72,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
  mostWornCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  mostWornHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  mostWornContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mostWornImage: { width: 64, height: 80, borderRadius: 8 },
  mostWornImagePlaceholder: { width: 64, height: 80, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mostWornInfo: { flex: 1, gap: 4 },
  mostWornName: { fontSize: 18, fontWeight: '700' },
  mostWornBrand: { fontSize: 14 },
  section: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { height: 1, marginVertical: 4 },
  wearRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wearImage: { width: 48, height: 60, borderRadius: 8 },
  wearImagePlaceholder: { width: 48, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  wearInfo: { flex: 1, gap: 2 },
  wearName: { fontSize: 14, fontWeight: '600' },
  wearBrand: { fontSize: 13 },
  wearDate: { fontSize: 12 },
  wearMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  wearTag: { fontSize: 11, fontWeight: '500', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  ratingRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyIconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  mostWornLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8709033',
  },
  shareOrb: {
    position: 'absolute',
    top: -70,
    right: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#e87090',
    opacity: 0.12,
  },
  shareCardInner: { padding: 20 },
  shareBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareBrandMark: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#e87090',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBrandText: { color: '#e87090', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  shareBrandDivider: { width: 1, height: 10, backgroundColor: '#e8709055' },
  shareBrandYear: { color: '#a8809a', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  shareName: {
    color: '#e87090',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  shareWeek: { color: '#f0ebe5', fontSize: 22, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
  shareStatRow: {
    flexDirection: 'row',
    marginTop: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e8709022',
  },
  shareStatBlock: { flex: 1, alignItems: 'center' },
  shareStatValue: { color: '#f0ebe5', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  shareStatLabel: { color: '#a8809a', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginTop: 4 },
  shareStatDivider: { width: 1, backgroundColor: '#e8709022' },
  shareMostWorn: { marginTop: 16 },
  shareMostWornLabel: { color: '#a8809a', fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  shareMostWornName: { color: '#f0ebe5', fontSize: 16, fontWeight: '800', marginTop: 6 },
  shareMostWornBrand: { color: '#c49a6c', fontSize: 12, fontWeight: '600', marginTop: 2 },
  shareCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e8709022',
  },
  shareCardFooterBrand: { color: '#a8809a', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  shareCardFooterJoin: { color: '#c49a6c', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  shareActions: { flexDirection: 'row', gap: 10 },
  shareActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#c49a6c',
    paddingVertical: 13,
    borderRadius: 14,
  },
  shareActionText: { color: '#0d0905', fontSize: 15, fontWeight: '800' },
  deeperSection: { marginTop: 4 },
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
    minHeight: 140,
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
});
