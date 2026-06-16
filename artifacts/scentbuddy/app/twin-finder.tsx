import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, Heart, Sparkle, Crown, Users, Drop, MagnifyingGlass, LockSimple } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { usePaywallPrompt } from '@/providers/PaywallPromptProvider';
import { supabase } from '@/lib/supabase';
import ProfileAvatar from '@/components/ProfileAvatar';
import ProBadge from '@/components/ProBadge';
import FeatureSpotlight from '@/components/FeatureSpotlight';

const FREE_LIMIT = 3;
const PRO_LIMIT = 100;

type RpcMatch = {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  is_pro: boolean | null;
  shared_bottles: number;
  shared_notes: number;
  score: number;
  has_more: boolean;
};

type TwinMatch = {
  userId: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  avatarEmoji: string | null;
  isPro: boolean;
  sharedBottles: number;
  sharedNotes: number;
  scorePct: number;
};

export default function TwinFinderScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { isPro } = useRevenueCat();
  const { openPaywall } = usePaywallPrompt();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const myCollectionCountQuery = useQuery({
    queryKey: ['twin-my-collection-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const { count, error } = await supabase
        .from('user_collections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id,
  });

  // Server enforces both the cap and the entitlement. Free users only ever
  // receive FREE_LIMIT real rows; the server returns a `has_more` flag on each
  // row so we know whether to show the "Unlock more" CTA without ever
  // receiving extra user identities.
  const planLimit = isPro ? PRO_LIMIT : FREE_LIMIT;

  const matchesQuery = useQuery({
    queryKey: ['twin-matches', user?.id, planLimit],
    queryFn: async () => {
      if (!user?.id) return { matches: [] as RpcMatch[], hasMore: false };

      const { data, error } = await supabase.rpc('get_twin_matches', { p_limit: planLimit });
      if (error) {
        if (error.code === '42883') {
          return { matches: [] as RpcMatch[], hasMore: false };
        }
        throw error;
      }
      const rows = (data ?? []) as RpcMatch[];
      const hasMore = rows.length > 0 ? !!rows[0].has_more : false;
      return { matches: rows, hasMore };
    },
    enabled: !!user?.id,
  });

  const { matches, hasMore } = matchesQuery.data ?? { matches: [], hasMore: false };

  const ranked: TwinMatch[] = useMemo(() => {
    if (matches.length === 0) return [];
    const topRaw = matches[0]?.score ?? 1;
    return matches.map(m => ({
      userId: m.user_id,
      displayName: m.display_name,
      username: m.username,
      avatarUrl: m.avatar_url,
      avatarEmoji: m.avatar_emoji,
      isPro: !!m.is_pro,
      sharedBottles: m.shared_bottles,
      sharedNotes: m.shared_notes,
      scorePct: topRaw > 0 ? Math.min(100, Math.max(1, Math.round((m.score / topRaw) * 100))) : 0,
    }));
  }, [matches]);

  const visibleMatches = ranked;
  const showLockedCta = !isPro && hasMore;

  const isLoading = myCollectionCountQuery.isLoading || matchesQuery.isLoading;
  const myCount = myCollectionCountQuery.data ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FeatureSpotlight
        storageKey="twin_finder"
        icon={Heart}
        iconColor="#e87090"
        gradientColors={['#1f0a18', '#180614', '#260a1c']}
        title="Find your fragrance twins"
        subtitle="We compare your collection with the rest of the community to surface people who share your taste."
        bullets={[
          { icon: Drop, text: 'Shared bottles count 3× — overlapping notes count 1×.' },
          { icon: MagnifyingGlass, text: 'Tap any match to peek at their full collection.' },
          { icon: Crown, text: 'Free shows your top 3 — Pro unlocks every match.' },
        ]}
      />
      <LinearGradient
        colors={[colors.accent + '22', colors.background]}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <CaretLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <Users size={26} color={colors.accent} weight="fill" />
            <Text style={[styles.title, { color: colors.text }]}>Find your Scent Twins</Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            Discover people whose collection mirrors yours.
          </Text>
        </View>
      </LinearGradient>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : myCount === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🌸</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Add fragrances first</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
            We need a few bottles in your collection to find your scent twins.
          </Text>
          <TouchableOpacity
            style={[styles.emptyCta, { backgroundColor: colors.accent }]}
            onPress={() => router.push('/(tabs)/collection' as any)}
          >
            <Text style={styles.emptyCtaText}>Build my collection</Text>
          </TouchableOpacity>
        </View>
      ) : ranked.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🔭</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No twins yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtext }]}>
            As more people add their collections, we&apos;ll surface your closest matches here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.summaryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>{ranked.length}{hasMore ? '+' : ''}</Text>
              <Text style={[styles.summaryLabel, { color: colors.subtext }]}>matches</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>{ranked[0]?.scorePct ?? 0}%</Text>
              <Text style={[styles.summaryLabel, { color: colors.subtext }]}>top affinity</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>{myCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.subtext }]}>your bottles</Text>
            </View>
          </View>

          {visibleMatches.map((match, idx) => (
            <TwinCard
              key={match.userId}
              match={match}
              rank={idx + 1}
              colors={colors}
              onPress={() => router.push({ pathname: '/user-profile', params: { userId: match.userId } })}
            />
          ))}

          {showLockedCta && (
            <View style={styles.lockedRowsWrap}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[styles.lockedRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.lockedRowContent}>
                    <View style={[styles.lockedAvatar, { backgroundColor: colors.accent + '22' }]} />
                    <View style={styles.lockedRowText}>
                      <View style={[styles.lockedBarWide, { backgroundColor: colors.border }]} />
                      <View style={[styles.lockedBarNarrow, { backgroundColor: colors.border }]} />
                    </View>
                    <View style={[styles.lockedScore, { backgroundColor: colors.accent + '22' }]} />
                  </View>
                  <BlurView
                    intensity={18}
                    tint={colors.background === '#ffffff' ? 'light' : 'dark'}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
              ))}
            </View>
          )}

          {showLockedCta && (
            <>
              <TouchableOpacity
                style={[styles.lockedCard, { borderColor: colors.accent }]}
                onPress={() => openPaywall('twin_finder')}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={[colors.accent + '20', colors.accent + '08']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Crown size={28} color={colors.accent} weight="fill" />
                <Text style={[styles.lockedTitle, { color: colors.text }]}>
                  More twins waiting
                </Text>
                <Text style={[styles.lockedSubtitle, { color: colors.subtext }]}>
                  Unlock all matches, message your twins, and see deep collection overlap with ScentBuddy+.
                </Text>
                <View style={[styles.lockedCta, { backgroundColor: colors.accent }]}>
                  <Text style={styles.lockedCtaText}>Unlock all twins</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.lockedSeeAllBtn}
                onPress={() => router.push({ pathname: '/pro-overview', params: { source: 'twin_finder' } } as any)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[styles.lockedSeeAll, { color: colors.accent }]}>See everything on Pro</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function TwinCard({ match, rank, colors, onPress }: { match: TwinMatch; rank: number; colors: any; onPress: () => void }) {
  const scoreColor = match.scorePct >= 60 ? '#e87090' : match.scorePct >= 30 ? colors.accent : colors.subtext;
  return (
    <TouchableOpacity
      style={[styles.matchCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.matchHeader}>
        <View style={[styles.rankBadge, { backgroundColor: colors.accent + '22' }]}>
          <Text style={[styles.rankText, { color: colors.accent }]}>#{rank}</Text>
        </View>
        <ProfileAvatar avatarUrl={match.avatarUrl} avatarEmoji={match.avatarEmoji} size={48} />
        <View style={styles.matchInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[styles.matchName, { color: colors.text }]} numberOfLines={1}>
              {match.displayName || match.username || 'Anonymous'}
            </Text>
            {match.isPro && <ProBadge size="xs" />}
          </View>
          <Text style={[styles.matchHandle, { color: colors.subtext }]} numberOfLines={1}>
            @{match.username || 'user'}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Heart size={14} color={scoreColor} weight="fill" />
          <Text style={[styles.scoreText, { color: scoreColor }]}>{match.scorePct}%</Text>
        </View>
      </View>

      <View style={styles.matchStatsRow}>
        <View style={styles.matchStatItem}>
          <Sparkle size={12} color={colors.subtext} />
          <Text style={[styles.matchStatText, { color: colors.subtext }]}>
            {match.sharedBottles} shared {match.sharedBottles === 1 ? 'bottle' : 'bottles'}
          </Text>
        </View>
        <View style={[styles.matchStatDot, { backgroundColor: colors.border }]} />
        <Text style={[styles.matchStatText, { color: colors.subtext }]}>
          {match.sharedNotes} common notes
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  headerContent: { gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    marginBottom: 6,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600' },
  summaryDivider: { width: 1, height: 28 },
  matchCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 13, fontWeight: '800' },
  matchInfo: { flex: 1, gap: 2 },
  matchName: { fontSize: 15, fontWeight: '700' },
  matchHandle: { fontSize: 12 },
  scoreBlock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreText: { fontSize: 16, fontWeight: '800' },
  matchStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  matchStatText: { fontSize: 12, fontWeight: '600' },
  matchStatDot: { width: 3, height: 3, borderRadius: 2 },
  lockedRowsWrap: { gap: 10, marginTop: 4 },
  lockedRow: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  lockedRowContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lockedAvatar: { width: 48, height: 48, borderRadius: 24 },
  lockedRowText: { flex: 1, gap: 8 },
  lockedBarWide: { height: 12, borderRadius: 6, width: '70%' },
  lockedBarNarrow: { height: 10, borderRadius: 5, width: '45%' },
  lockedScore: { width: 44, height: 44, borderRadius: 22 },
  lockedCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 20,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    marginTop: 8,
  },
  lockedTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  lockedSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  lockedCta: { borderRadius: 100, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  lockedCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  lockedSeeAllBtn: { alignItems: 'center', marginTop: 14, paddingVertical: 4 },
  lockedSeeAll: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyCta: { borderRadius: 100, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
