import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Alert,
  Share as RNShare,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CaretLeft,
  EyeSlash,
  Plus,
  Sparkle,
  ShareNetwork,
  Check,
  X,
  ClipboardText,
} from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { supabase, forceHttps } from '@/lib/supabase';
import { CollectionItem } from '@/lib/types';

type BlindTestRow = {
  id: string;
  creator_id: string;
  perfume_name: string;
  perfume_brand: string;
  concentration: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  description: string | null;
  image_url: string | null;
  is_public: boolean;
  closes_at: string | null;
  created_at: string;
};

// Returned by get_ratable_blind_tests RPC. The server intentionally redacts
// perfume_name, perfume_brand, and image_url so the UI can stay blind, and
// only emits public tests (so is_public is implied and not returned).
type RatableBlindTestRow = {
  id: string;
  creator_id: string;
  concentration: string | null;
  top_notes: string[];
  heart_notes: string[];
  base_notes: string[];
  description: string | null;
  closes_at: string | null;
  created_at: string;
};

export default function BlindTestScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [description, setDescription] = useState('');
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const [creating, setCreating] = useState(false);

  const collectionQuery = useQuery({
    queryKey: ['blind-test-collection', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CollectionItem[];
    },
    enabled: !!user?.id,
  });

  const myTestsQuery = useQuery({
    queryKey: ['blind-tests-mine', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('blind_tests')
        .select('*')
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as BlindTestRow[];
    },
    enabled: !!user?.id,
  });

  const ratableTestsQuery = useQuery({
    queryKey: ['blind-tests-ratable', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      // Server returns redacted rows: NO perfume_name, perfume_brand, or image_url
      // and excludes tests the user already rated or created.
      const { data, error } = await supabase.rpc('get_ratable_blind_tests', { p_limit: 40 });
      if (error) {
        if (error.code === '42883' || error.code === '42P01') return [];
        throw error;
      }
      return (data ?? []) as RatableBlindTestRow[];
    },
    enabled: !!user?.id,
  });

  const ratingsCountByTest = useQuery({
    queryKey: ['blind-tests-rating-counts', user?.id, myTestsQuery.data?.map(t => t.id).join(',')],
    queryFn: async () => {
      const ids = (myTestsQuery.data ?? []).map(t => t.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from('blind_test_ratings')
        .select('test_id')
        .in('test_id', ids);
      if (error) {
        if (error.code === '42P01') return {} as Record<string, number>;
        throw error;
      }
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        map[r.test_id] = (map[r.test_id] || 0) + 1;
      });
      return map;
    },
    enabled: !!user?.id && (myTestsQuery.data ?? []).length > 0,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !selectedItem) throw new Error('Missing data');
      const { data, error } = await supabase
        .from('blind_tests')
        .insert({
          creator_id: user.id,
          perfume_name: selectedItem.perfume_name,
          perfume_brand: selectedItem.perfume_brand,
          concentration: selectedItem.concentration,
          top_notes: selectedItem.top_notes ?? [],
          heart_notes: selectedItem.heart_notes ?? [],
          base_notes: selectedItem.base_notes ?? [],
          image_url: selectedItem.image_url,
          description: description.trim() || null,
          is_public: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as BlindTestRow;
    },
    onSuccess: async (test) => {
      await queryClient.invalidateQueries({ queryKey: ['blind-tests-mine'] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedItem(null);
      setDescription('');
      setCreating(false);

      const shareUrl = `https://scentbuddy.io/blind-test/${test.id}`;
      try {
        await RNShare.share({
          message: `Can you guess what fragrance I'm wearing? Rate it blind on ScentBuddy 🤫\n${shareUrl}`,
        });
      } catch {
        // ignored
      }
    },
    onError: (e: any) => {
      setCreating(false);
      const msg = e?.code === '42P01'
        ? 'The Blind Test feature needs database setup. See SQL migration in supabase/migrations/.'
        : (e?.message ?? 'Could not create blind test.');
      Alert.alert('Oops', msg);
    },
  });

  const filteredCollection = useMemo(() => {
    const items = collectionQuery.data ?? [];
    if (!pickerSearch.trim()) return items;
    const q = pickerSearch.toLowerCase();
    return items.filter(c =>
      c.perfume_name.toLowerCase().includes(q) || c.perfume_brand.toLowerCase().includes(q)
    );
  }, [collectionQuery.data, pickerSearch]);

  const handleCreate = useCallback(() => {
    if (!selectedItem) return;
    setCreating(true);
    createMutation.mutate();
  }, [selectedItem, createMutation]);

  const ratable = ratableTestsQuery.data ?? [];
  const mine = myTestsQuery.data ?? [];

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
          <View style={styles.titleRow}>
            <EyeSlash size={26} color={colors.accent} weight="fill" />
            <Text style={[styles.title, { color: colors.text }]}>Blind Test</Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.subtext }]}>
            Friends rate your fragrances using only the notes — names hidden.
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Create a test</Text>
        </View>

        {selectedItem ? (
          <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.previewBadge}>
              <EyeSlash size={12} color={colors.accent} weight="fill" />
              <Text style={[styles.previewBadgeText, { color: colors.accent }]}>BLIND PREVIEW</Text>
            </View>
            <Text style={[styles.previewLabel, { color: colors.subtext }]}>What raters will see:</Text>

            <View style={styles.notesPreview}>
              {[...(selectedItem.top_notes ?? []), ...(selectedItem.heart_notes ?? []), ...(selectedItem.base_notes ?? [])]
                .slice(0, 12)
                .map((n, i) => (
                  <View key={`${n}-${i}`} style={[styles.notePill, { backgroundColor: colors.chip }]}>
                    <Text style={[styles.notePillText, { color: colors.text }]}>{n}</Text>
                  </View>
                ))}
            </View>

            {selectedItem.concentration && (
              <Text style={[styles.previewMeta, { color: colors.subtext }]}>{selectedItem.concentration}</Text>
            )}

            <TextInput
              style={[styles.descInput, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
              placeholder="Optional hint or description (no name/brand!)"
              placeholderTextColor={colors.subtext}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={140}
            />

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => { setSelectedItem(null); setDescription(''); }}
                disabled={creating}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <ShareNetwork size={16} color="#fff" weight="bold" />
                    <Text style={styles.primaryBtnText}>Publish & invite</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.createCta, { borderColor: colors.accent }]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[colors.accent + '20', colors.accent + '08']}
              style={StyleSheet.absoluteFill}
            />
            <Plus size={28} color={colors.accent} weight="bold" />
            <Text style={[styles.createCtaTitle, { color: colors.text }]}>Pick a fragrance</Text>
            <Text style={[styles.createCtaSubtitle, { color: colors.subtext }]}>
              Choose any bottle from your collection. We&apos;ll hide the name and let your friends guess.
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Tests for you to rate</Text>
          {ratable.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.accent }]}>
              <Text style={styles.countBadgeText}>{ratable.length}</Text>
            </View>
          )}
        </View>

        {ratableTestsQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : ratable.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Sparkle size={20} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              No new blind tests right now. Check back later or invite friends.
            </Text>
          </View>
        ) : (
          ratable.map(test => (
            <RatableTestCard
              key={test.id}
              test={test}
              colors={colors}
              onPress={() => router.push({ pathname: '/blind-test/[id]', params: { id: test.id } })}
            />
          ))
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your tests</Text>
        </View>

        {myTestsQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
        ) : mine.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ClipboardText size={20} color={colors.subtext} />
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              You haven&apos;t created any blind tests yet.
            </Text>
          </View>
        ) : (
          mine.map(test => (
            <TouchableOpacity
              key={test.id}
              style={[styles.myTestCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: '/blind-test/[id]', params: { id: test.id } })}
            >
              {test.image_url ? (
                <Image source={{ uri: forceHttps(test.image_url) ?? undefined }} style={styles.myTestImage} resizeMode="contain" />
              ) : (
                <View style={[styles.myTestImagePlaceholder, { backgroundColor: colors.chip }]}>
                  <Sparkle size={20} color={colors.subtext} weight="fill" />
                </View>
              )}
              <View style={styles.myTestInfo}>
                <Text style={[styles.myTestName, { color: colors.text }]} numberOfLines={1}>{test.perfume_name}</Text>
                <Text style={[styles.myTestBrand, { color: colors.subtext }]} numberOfLines={1}>{test.perfume_brand}</Text>
                <View style={styles.myTestMeta}>
                  <Text style={[styles.myTestMetaText, { color: colors.subtext }]}>
                    {ratingsCountByTest.data?.[test.id] ?? 0} {((ratingsCountByTest.data?.[test.id] ?? 0) === 1) ? 'rating' : 'ratings'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.shareIconBtn, { backgroundColor: colors.chip }]}
                onPress={async () => {
                  try {
                    await RNShare.share({
                      message: `Can you guess what I'm wearing? Rate it blind 🤫\nhttps://scentbuddy.io/blind-test/${test.id}`,
                    });
                  } catch {
                    // ignored
                  }
                }}
              >
                <ShareNetwork size={16} color={colors.text} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background, paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 12 }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Pick a fragrance</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.searchInput, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
            placeholder="Search your collection..."
            placeholderTextColor={colors.subtext}
            value={pickerSearch}
            onChangeText={setPickerSearch}
          />

          {collectionQuery.isLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
          ) : (collectionQuery.data ?? []).length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16 }]}>
              <Text style={[styles.emptyText, { color: colors.subtext }]}>
                Add some fragrances to your collection first.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
              {filteredCollection.map(item => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.pickerRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelectedItem(item);
                    setShowPicker(false);
                  }}
                  activeOpacity={0.85}
                >
                  {item.image_url ? (
                    <Image source={{ uri: forceHttps(item.image_url) ?? undefined }} style={styles.pickerImage} resizeMode="contain" />
                  ) : (
                    <View style={[styles.pickerImagePlaceholder, { backgroundColor: colors.chip }]}>
                      <Sparkle size={16} color={colors.subtext} weight="fill" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerName, { color: colors.text }]} numberOfLines={1}>{item.perfume_name}</Text>
                    <Text style={[styles.pickerBrand, { color: colors.subtext }]} numberOfLines={1}>{item.perfume_brand}</Text>
                  </View>
                  <Check size={18} color={colors.accent} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

function RatableTestCard({ test, colors, onPress }: { test: RatableBlindTestRow; colors: any; onPress: () => void }) {
  const allNotes = [...(test.top_notes ?? []), ...(test.heart_notes ?? []), ...(test.base_notes ?? [])].slice(0, 6);
  return (
    <TouchableOpacity
      style={[styles.ratableCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.ratableHeader}>
        <View style={[styles.blindBadge, { backgroundColor: colors.accent + '22' }]}>
          <EyeSlash size={12} color={colors.accent} weight="fill" />
          <Text style={[styles.blindBadgeText, { color: colors.accent }]}>BLIND</Text>
        </View>
        {test.concentration && (
          <Text style={[styles.ratableConc, { color: colors.subtext }]}>{test.concentration}</Text>
        )}
      </View>

      {allNotes.length > 0 && (
        <View style={styles.ratableNotes}>
          {allNotes.map((n, i) => (
            <View key={`${n}-${i}`} style={[styles.notePillSm, { backgroundColor: colors.chip }]}>
              <Text style={[styles.notePillSmText, { color: colors.text }]}>{n}</Text>
            </View>
          ))}
        </View>
      )}

      {test.description && (
        <Text style={[styles.ratableDesc, { color: colors.subtext }]} numberOfLines={2}>&ldquo;{test.description}&rdquo;</Text>
      )}

      <View style={[styles.ratableCta, { backgroundColor: colors.accent }]}>
        <Text style={styles.ratableCtaText}>Rate it →</Text>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  countBadge: { borderRadius: 12, minWidth: 22, paddingHorizontal: 8, paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  createCta: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  createCtaTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  createCtaSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  previewBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  previewBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  previewLabel: { fontSize: 12, fontWeight: '600' },
  notesPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  notePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100 },
  notePillText: { fontSize: 12, fontWeight: '600' },
  previewMeta: { fontSize: 12, fontWeight: '600' },
  descInput: { minHeight: 60, borderRadius: 10, borderWidth: 1, padding: 10, fontSize: 14, textAlignVertical: 'top' },
  previewActions: { flexDirection: 'row', gap: 8 },
  secondaryBtn: { flex: 1, borderRadius: 100, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtn: { flex: 1.5, borderRadius: 100, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  ratableCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  ratableHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blindBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  blindBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  ratableConc: { fontSize: 12, fontWeight: '600' },
  ratableNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  notePillSm: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
  notePillSmText: { fontSize: 11, fontWeight: '600' },
  ratableDesc: { fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  ratableCta: { alignSelf: 'flex-start', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, marginTop: 4 },
  ratableCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  myTestCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 12 },
  myTestImage: { width: 48, height: 60, borderRadius: 8 },
  myTestImagePlaceholder: { width: 48, height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  myTestInfo: { flex: 1, gap: 2 },
  myTestName: { fontSize: 14, fontWeight: '700' },
  myTestBrand: { fontSize: 12 },
  myTestMeta: { flexDirection: 'row', gap: 6, marginTop: 4 },
  myTestMetaText: { fontSize: 11, fontWeight: '600' },
  shareIconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  searchInput: { marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  pickerImage: { width: 40, height: 50, borderRadius: 6 },
  pickerImagePlaceholder: { width: 40, height: 50, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  pickerName: { fontSize: 14, fontWeight: '700' },
  pickerBrand: { fontSize: 12, marginTop: 2 },
});
