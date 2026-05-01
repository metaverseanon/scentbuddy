import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CaretLeft,
  EyeSlash,
  Eye,
  Star,
  Sparkle,
  CheckCircle,
  Heart,
  ThumbsUp,
  ThumbsDown,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { SCENT_FAMILIES } from '@/lib/types';

type BlindTestRow = {
  id: string;
  creator_id: string;
  perfume_name: string | null;
  perfume_brand: string | null;
  concentration: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  description: string | null;
  image_url: string | null;
  is_public: boolean;
  closes_at?: string | null;
  created_at: string;
  revealed: boolean;
};

type RatingRow = {
  id: string;
  test_id: string;
  rater_id: string;
  rating: number;
  would_buy: boolean | null;
  guessed_family: string | null;
  comment: string | null;
  created_at: string;
};

const FAMILY_OPTIONS = SCENT_FAMILIES.map(f => f.name);

export default function BlindTestRateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [rating, setRating] = useState<number>(0);
  const [wouldBuy, setWouldBuy] = useState<boolean | null>(null);
  const [guessedFamily, setGuessedFamily] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const testQuery = useQuery({
    queryKey: ['blind-test', id, user?.id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.rpc('get_blind_test', { p_test_id: id });
      if (error) throw error;
      const rows = (data ?? []) as BlindTestRow[];
      return rows[0] ?? null;
    },
    enabled: !!id && !!user?.id,
  });

  const myRatingQuery = useQuery({
    queryKey: ['blind-test-my-rating', id, user?.id],
    queryFn: async () => {
      if (!id || !user?.id) return null;
      const { data, error } = await supabase
        .from('blind_test_ratings')
        .select('*')
        .eq('test_id', id)
        .eq('rater_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RatingRow | null;
    },
    enabled: !!id && !!user?.id,
  });

  const allRatingsQuery = useQuery({
    queryKey: ['blind-test-all-ratings', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('blind_test_ratings')
        .select('*')
        .eq('test_id', id);
      if (error) throw error;
      return (data ?? []) as RatingRow[];
    },
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !id || rating === 0) throw new Error('Pick a rating first');
      const { error } = await supabase
        .from('blind_test_ratings')
        .insert({
          test_id: id,
          rater_id: user.id,
          rating,
          would_buy: wouldBuy,
          guessed_family: guessedFamily,
        });
      if (error) throw error;
    },
    onSuccess: async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['blind-test', id] }),
        queryClient.invalidateQueries({ queryKey: ['blind-test-my-rating', id] }),
        queryClient.invalidateQueries({ queryKey: ['blind-test-all-ratings', id] }),
        queryClient.invalidateQueries({ queryKey: ['blind-tests-ratable'] }),
      ]);
      setSubmitting(false);
    },
    onError: (e: any) => {
      setSubmitting(false);
      Alert.alert('Could not submit', e?.message ?? 'Try again.');
    },
  });

  const test = testQuery.data;
  const myRating = myRatingQuery.data;
  const allRatings = allRatingsQuery.data ?? [];
  const isCreator = !!user && !!test && test.creator_id === user.id;
  const hasRated = !!myRating;
  const revealed = test?.revealed === true || isCreator || hasRated;

  const stats = useMemo(() => {
    if (allRatings.length === 0) return null;
    const avg = allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length;
    const wouldBuyCount = allRatings.filter(r => r.would_buy === true).length;
    const wouldBuyPct = Math.round((wouldBuyCount / allRatings.length) * 100);
    const familyGuessCounts: Record<string, number> = {};
    allRatings.forEach(r => {
      if (r.guessed_family) {
        familyGuessCounts[r.guessed_family] = (familyGuessCounts[r.guessed_family] || 0) + 1;
      }
    });
    const topGuess = Object.entries(familyGuessCounts).sort(([, a], [, b]) => b - a)[0];
    return {
      avg,
      count: allRatings.length,
      wouldBuyPct,
      topGuess: topGuess ? topGuess[0] : null,
      topGuessCount: topGuess ? topGuess[1] : 0,
    };
  }, [allRatings]);

  const handleSubmit = useCallback(() => {
    if (rating === 0) {
      Alert.alert('Pick a rating', 'Tap the stars to rate this fragrance from 1 to 5.');
      return;
    }
    setSubmitting(true);
    submitMutation.mutate();
  }, [rating, submitMutation]);

  if (testQuery.isLoading || !test) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const allNotes = [...(test.top_notes ?? []), ...(test.heart_notes ?? []), ...(test.base_notes ?? [])];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[colors.accent + '22', colors.background]}
        style={[styles.headerGradient, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <CaretLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          {revealed ? (
            <Eye size={24} color={colors.accent} weight="fill" />
          ) : (
            <EyeSlash size={24} color={colors.accent} weight="fill" />
          )}
          <Text style={[styles.title, { color: colors.text }]}>
            {revealed ? 'Revealed' : 'Blind Test'}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {revealed ? (
          <View style={[styles.revealCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <View style={styles.revealRow}>
              {test.image_url ? (
                <Image source={{ uri: forceHttps(test.image_url) ?? undefined }} style={styles.revealImage} resizeMode="contain" />
              ) : (
                <View style={[styles.revealImagePlaceholder, { backgroundColor: colors.chip }]}>
                  <Sparkle size={28} color={colors.subtext} weight="fill" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.revealLabel, { color: colors.accent }]}>THE FRAGRANCE</Text>
                <Text style={[styles.revealName, { color: colors.text }]}>{test.perfume_name}</Text>
                <Text style={[styles.revealBrand, { color: colors.subtext }]}>{test.perfume_brand}</Text>
                {test.concentration && (
                  <Text style={[styles.revealConc, { color: colors.subtext }]}>{test.concentration}</Text>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={[styles.blindCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.blindBadgeRow}>
              <View style={[styles.blindBadge, { backgroundColor: colors.accent + '22' }]}>
                <EyeSlash size={12} color={colors.accent} weight="fill" />
                <Text style={[styles.blindBadgeText, { color: colors.accent }]}>NAME HIDDEN</Text>
              </View>
              {test.concentration && (
                <Text style={[styles.blindConc, { color: colors.subtext }]}>{test.concentration}</Text>
              )}
            </View>
            <Text style={[styles.blindLabel, { color: colors.subtext }]}>NOTES</Text>
            <View style={styles.notesList}>
              {allNotes.map((n, i) => (
                <View key={`${n}-${i}`} style={[styles.notePill, { backgroundColor: colors.chip }]}>
                  <Text style={[styles.notePillText, { color: colors.text }]}>{n}</Text>
                </View>
              ))}
            </View>
            {test.description && (
              <Text style={[styles.blindDesc, { color: colors.text }]}>&ldquo;{test.description}&rdquo;</Text>
            )}
          </View>
        )}

        {!hasRated && !isCreator && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Your verdict</Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setRating(n);
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Star
                    size={36}
                    color={n <= rating ? colors.accent : colors.border}
                    weight={n <= rating ? 'fill' : 'regular'}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.subQuestion, { color: colors.text }]}>Would you buy it?</Text>
            <View style={styles.buyRow}>
              <TouchableOpacity
                style={[
                  styles.buyBtn,
                  {
                    backgroundColor: wouldBuy === true ? colors.accent : colors.background,
                    borderColor: wouldBuy === true ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setWouldBuy(true)}
              >
                <ThumbsUp size={16} color={wouldBuy === true ? '#fff' : colors.text} weight={wouldBuy === true ? 'fill' : 'regular'} />
                <Text style={[styles.buyBtnText, { color: wouldBuy === true ? '#fff' : colors.text }]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.buyBtn,
                  {
                    backgroundColor: wouldBuy === false ? colors.text : colors.background,
                    borderColor: wouldBuy === false ? colors.text : colors.border,
                  },
                ]}
                onPress={() => setWouldBuy(false)}
              >
                <ThumbsDown size={16} color={wouldBuy === false ? colors.background : colors.text} weight={wouldBuy === false ? 'fill' : 'regular'} />
                <Text style={[styles.buyBtnText, { color: wouldBuy === false ? colors.background : colors.text }]}>No</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.subQuestion, { color: colors.text }]}>What family do you guess?</Text>
            <View style={styles.familyRow}>
              {FAMILY_OPTIONS.map(f => {
                const active = guessedFamily === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.familyChip,
                      {
                        backgroundColor: active ? colors.accent : colors.background,
                        borderColor: active ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setGuessedFamily(active ? null : f)}
                  >
                    <Text style={[styles.familyChipText, { color: active ? '#fff' : colors.text }]}>{f}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.accent, opacity: rating === 0 ? 0.5 : 1 }]}
              onPress={handleSubmit}
              disabled={submitting || rating === 0}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <CheckCircle size={18} color="#fff" weight="fill" />
                  <Text style={styles.submitBtnText}>Submit & reveal</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {revealed && stats && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Crowd verdict</Text>
            <View style={styles.statRow}>
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{stats.avg.toFixed(1)}</Text>
                <Text style={[styles.statLabel, { color: colors.subtext }]}>avg rating</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{stats.count}</Text>
                <Text style={[styles.statLabel, { color: colors.subtext }]}>{stats.count === 1 ? 'rater' : 'raters'}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
              <View style={styles.statBlock}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{stats.wouldBuyPct}%</Text>
                <Text style={[styles.statLabel, { color: colors.subtext }]}>would buy</Text>
              </View>
            </View>

            {stats.topGuess && (
              <View style={[styles.guessBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Heart size={14} color={colors.accent} weight="fill" />
                <Text style={[styles.guessText, { color: colors.text }]}>
                  Most-guessed family: <Text style={{ color: colors.accent, fontWeight: '700' }}>{stats.topGuess}</Text> ({stats.topGuessCount})
                </Text>
              </View>
            )}

            {hasRated && myRating && (
              <View style={[styles.myRatingRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.myRatingLabel, { color: colors.subtext }]}>Your rating</Text>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star
                      key={n}
                      size={14}
                      color={n <= myRating.rating ? colors.accent : colors.border}
                      weight={n <= myRating.rating ? 'fill' : 'regular'}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  blindCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 12 },
  blindBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blindBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  blindBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  blindConc: { fontSize: 12, fontWeight: '600' },
  blindLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  notesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  notePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 },
  notePillText: { fontSize: 12, fontWeight: '600' },
  blindDesc: { fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 4 },
  revealCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, overflow: 'hidden' },
  revealRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  revealImage: { width: 70, height: 88, borderRadius: 8 },
  revealImagePlaceholder: { width: 70, height: 88, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  revealLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  revealName: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  revealBrand: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  revealConc: { fontSize: 12, marginTop: 4 },
  section: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  starsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  subQuestion: { fontSize: 14, fontWeight: '600' },
  buyRow: { flexDirection: 'row', gap: 8 },
  buyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 100, borderWidth: 1 },
  buyBtnText: { fontSize: 14, fontWeight: '700' },
  familyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  familyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },
  familyChipText: { fontSize: 12, fontWeight: '600' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 100, marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  statDivider: { width: 1, height: 32 },
  guessBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  guessText: { fontSize: 13, flex: 1 },
  myRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1 },
  myRatingLabel: { fontSize: 12, fontWeight: '600' },
});
