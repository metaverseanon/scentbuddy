import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import {
  X,
  Sparkle,
  Binoculars,
  Heart,
  EyeSlash,
  CalendarHeart,
  ArrowRight,
  Check,
  Crown,
  Lightning,
  Trophy,
} from 'phosphor-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const WHATSNEW_KEY = 'scentbuddy_whatsnew_seen_version';
const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

type FeaturePage = {
  icon: React.ElementType;
  iconColor: string;
  gradientColors: [string, string, string];
  emoji: string;
  title: string;
  subtitle: string;
};

const PAGES: FeaturePage[] = [
  {
    icon: Trophy,
    iconColor: '#FFD23F',
    gradientColors: ['#1a1408', '#2d2310', '#1a1408'],
    emoji: '🏆',
    title: 'Biggest\nCollection',
    subtitle:
      'New leaderboard category is live — see who owns the most bottles in the community. Open Community to climb the ranks.',
  },
  {
    icon: Binoculars,
    iconColor: '#5B8DEF',
    gradientColors: ['#0a1422', '#10203a', '#0a1422'],
    emoji: '🧭',
    title: 'Smarter\nDiscover',
    subtitle:
      'Find people who match your taste — filter by Suggested, New, Collectors and Popular, with reasons why each pick fits you.',
  },
  {
    icon: Heart,
    iconColor: '#e87090',
    gradientColors: ['#1f0a18', '#2a0c20', '#1a0716'],
    emoji: '💞',
    title: 'Twin\nFinder',
    subtitle:
      'We compare your collection against the community and rank the people who share the most bottles and notes with you.',
  },
  {
    icon: EyeSlash,
    iconColor: '#8B5CF6',
    gradientColors: ['#140f1a', '#1f1828', '#160e22'],
    emoji: '🕵️',
    title: 'Group\nBlind Test',
    subtitle:
      'Send a fragrance to friends without revealing the name or brand and see how it scores on its own merits.',
  },
  {
    icon: CalendarHeart,
    iconColor: '#E8A838',
    gradientColors: ['#1a1308', '#2a2010', '#180f06'],
    emoji: '✨',
    title: 'Monthly\nWrapped',
    subtitle:
      'A beautiful Spotify-style recap of your fragrance month — top fragrance, family, mood and a heatmap. Save or share the card.',
  },
  {
    icon: Crown,
    iconColor: '#E8A838',
    gradientColors: ['#1a1308', '#2a1f08', '#1a1308'],
    emoji: '👑',
    title: 'Pro\nBadges',
    subtitle:
      "Pro members now get a gold badge next to their name everywhere — Discover, Leaderboard, Wear feed, Community Picks and more.",
  },
];

export async function resetWhatsNew() {
  try {
    await AsyncStorage.removeItem(WHATSNEW_KEY);
  } catch {}
}

export default function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnims = useRef(PAGES.map(() => new Animated.Value(0))).current;
  const slideAnims = useRef(PAGES.map(() => new Animated.Value(40))).current;
  const emojiScale = useRef(PAGES.map(() => new Animated.Value(0.3))).current;
  const emojiRotate = useRef(PAGES.map(() => new Animated.Value(-15))).current;
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [seenVersion, onboardingDone] = await Promise.all([
          AsyncStorage.getItem(WHATSNEW_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);

        const isFreshInstall = onboardingDone !== 'true';
        if (isFreshInstall) {
          await AsyncStorage.setItem(WHATSNEW_KEY, currentVersion);
          return;
        }

        if (seenVersion === currentVersion) return;

        if (!cancelled) setVisible(true);
      } catch (e) {
        console.log('[WhatsNew] check failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVersion]);

  const animatePage = useCallback((index: number) => {
    fadeAnims[index].setValue(0);
    slideAnims[index].setValue(40);
    emojiScale[index].setValue(0.3);
    emojiRotate[index].setValue(-15);

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(emojiScale[index], {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.5)),
          useNativeDriver: true,
        }),
        Animated.timing(emojiRotate[index], {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(fadeAnims[index], {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slideAnims[index], {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [fadeAnims, slideAnims, emojiScale, emojiRotate]);

  useEffect(() => {
    if (visible) {
      setCurrentPage(0);
      // Snap back to first page in case the modal was previously dismissed
      // mid-pager and is re-opened in the same JS session.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      });
      animatePage(0);
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  }, [visible, animatePage]);

  const dismiss = useCallback(async () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setVisible(false);
    try {
      await AsyncStorage.setItem(WHATSNEW_KEY, currentVersion);
    } catch (e) {
      console.log('[WhatsNew] persist failed', e);
    }
  }, [currentVersion]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newPage = Math.round(offsetX / SCREEN_WIDTH);
    if (newPage !== currentPage && newPage >= 0 && newPage < PAGES.length) {
      setCurrentPage(newPage);
      animatePage(newPage);
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
    }
  }, [currentPage, animatePage]);

  const goNext = useCallback(() => {
    if (currentPage >= PAGES.length - 1) {
      void dismiss();
      return;
    }
    const next = currentPage + 1;
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [currentPage, dismiss]);

  if (!visible) return null;

  const isLast = currentPage === PAGES.length - 1;

  return (
    <Modal
      transparent={false}
      animationType="slide"
      visible={visible}
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <LinearGradient
          colors={PAGES[currentPage].gradientColors}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />

        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Lightning size={11} color="#E8A838" weight="fill" />
            <Text style={styles.headerBadgeText}>WHAT'S NEW · v{currentVersion}</Text>
          </View>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={dismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.skipText}>Skip</Text>
            <X size={14} color="rgba(255,255,255,0.55)" weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.pagerScroll}
        >
          {PAGES.map((page, i) => {
            const PageIcon = page.icon;
            const rotate = emojiRotate[i].interpolate({
              inputRange: [-15, 0],
              outputRange: ['-15deg', '0deg'],
            });
            return (
              <View key={i} style={styles.page}>
                <View style={styles.pageContent}>
                  <Animated.View
                    style={[
                      styles.iconWrap,
                      {
                        transform: [
                          { scale: emojiScale[i] },
                          { rotate },
                        ],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconRing,
                        { borderColor: page.iconColor + '55' },
                      ]}
                    >
                      <View
                        style={[
                          styles.iconInner,
                          { backgroundColor: page.iconColor + '22' },
                        ]}
                      >
                        <PageIcon
                          size={64}
                          color={page.iconColor}
                          weight="duotone"
                        />
                      </View>
                    </View>
                    <View
                      style={[
                        styles.emojiBadge,
                        { backgroundColor: page.iconColor },
                      ]}
                    >
                      <Text style={styles.emojiBadgeText}>{page.emoji}</Text>
                    </View>
                  </Animated.View>

                  <Animated.View
                    style={{
                      opacity: fadeAnims[i],
                      transform: [{ translateY: slideAnims[i] }],
                    }}
                  >
                    <Text style={styles.title}>{page.title}</Text>
                    <Text style={styles.subtitle}>{page.subtitle}</Text>
                  </Animated.View>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {PAGES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === currentPage ? 22 : 6,
                    backgroundColor:
                      i === currentPage
                        ? PAGES[currentPage].iconColor
                        : 'rgba(255,255,255,0.22)',
                  },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: PAGES[currentPage].iconColor },
            ]}
            onPress={goNext}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>
              {isLast ? "Let's go" : 'Next'}
            </Text>
            {isLast ? (
              <Check size={18} color="#fff" weight="bold" />
            ) : (
              <ArrowRight size={18} color="#fff" weight="bold" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0510',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 36,
    paddingBottom: 12,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(232,168,56,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,56,0.28)',
  },
  headerBadgeText: {
    color: '#E8A838',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '700',
  },
  pagerScroll: { flex: 1 },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 28,
  },
  pageContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  iconRing: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0a0510',
  },
  emojiBadgeText: { fontSize: 22 },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.6,
    lineHeight: 40,
    marginBottom: 18,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 12,
    gap: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 18,
  },
  ctaText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
