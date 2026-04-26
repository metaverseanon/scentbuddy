import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { CaretLeft, Drop, Star, CalendarBlank, Sparkle, PlusCircle, Heart } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { WearDiaryEntry, CollectionItem, WishlistItem } from '@/lib/types';

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
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { start, end } = getWeekRange();

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
          <Text style={[styles.emptyIcon]}>🌸</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No activity this week</Text>
          <Text style={[styles.emptySubtext, { color: colors.subtext }]}>Start logging your wears and adding to your collection to see your weekly recap.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
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
                <Text style={[styles.sectionLabel, { color: colors.subtext }]}>⭐ Most Worn This Week</Text>
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
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
