import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { Check, X, Sparkle, Binoculars, Heart, EyeSlash, CalendarHeart, Lightning } from 'phosphor-react-native';

const WHATSNEW_KEY = 'scentbuddy_whatsnew_seen_version';
const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

type Highlight = {
  icon: React.ElementType;
  title: string;
  text: string;
};

// Highlights to surface for the *current* app version. Update this list when
// shipping a new version with notable user-facing changes.
const HIGHLIGHTS: Highlight[] = [
  {
    icon: Binoculars,
    title: 'Smarter Discover',
    text: 'Find people via Suggested, New, Collectors and Popular filters — with reasons why.',
  },
  {
    icon: Heart,
    title: 'Twin Finder',
    text: 'Match with users who share your scent DNA — bottles and notes in common.',
  },
  {
    icon: EyeSlash,
    title: 'Group Blind Test',
    text: 'Friends rate your fragrances without seeing the name or brand.',
  },
  {
    icon: CalendarHeart,
    title: 'Monthly Wrapped',
    text: 'A beautiful recap of your fragrance month — share or save the card.',
  },
];

export async function resetWhatsNew() {
  try {
    await AsyncStorage.removeItem(WHATSNEW_KEY);
  } catch {}
}

export default function WhatsNewModal() {
  const [visible, setVisible] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const currentVersion = Constants.expoConfig?.version ?? '0.0.0';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [seenVersion, onboardingDone] = await Promise.all([
          AsyncStorage.getItem(WHATSNEW_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);

        // Brand-new install: silently mark this version as seen so they
        // don't get a "what's new" pop the first time they open the app.
        const isFreshInstall = onboardingDone !== 'true';
        if (isFreshInstall) {
          await AsyncStorage.setItem(WHATSNEW_KEY, currentVersion);
          return;
        }

        // Existing user already on the current version: nothing to show.
        if (seenVersion === currentVersion) return;

        // Existing user (onboarded) who is on a different / older version
        // — show the highlights for the current build.
        if (!cancelled) setVisible(true);
      } catch (e) {
        console.log('[WhatsNew] check failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentVersion]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
    }
  }, [visible, fade, scale]);

  const dismiss = async () => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 0.94,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
    try {
      await AsyncStorage.setItem(WHATSNEW_KEY, currentVersion);
    } catch (e) {
      console.log('[WhatsNew] persist failed', e);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="none"
      visible={visible}
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <Animated.View
          style={[
            styles.cardWrap,
            { opacity: fade, transform: [{ scale }] },
          ]}
        >
          <LinearGradient
            colors={['#1a0a20', '#120516', '#22082a']}
            style={styles.card}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color="rgba(255,255,255,0.55)" weight="bold" />
            </TouchableOpacity>

            <View style={styles.iconWrap}>
              <View style={styles.iconRing}>
                <View style={styles.iconInner}>
                  <Lightning size={36} color="#E8A838" weight="duotone" />
                </View>
              </View>
              <View style={styles.sparkleBadge}>
                <Sparkle size={12} color="#fff" weight="fill" />
              </View>
            </View>

            <Text style={styles.title}>What's new</Text>
            <Text style={styles.subtitle}>
              Fresh upgrades since you last opened ScentBuddy — version {currentVersion}.
            </Text>

            <ScrollView
              style={styles.bullets}
              contentContainerStyle={styles.bulletsContent}
              showsVerticalScrollIndicator={false}
            >
              {HIGHLIGHTS.map((h, i) => {
                const HIcon = h.icon;
                return (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletIconWrap}>
                      <HIcon size={16} color="#E8A838" weight="bold" />
                    </View>
                    <View style={styles.bulletTextCol}>
                      <Text style={styles.bulletTitle}>{h.title}</Text>
                      <Text style={styles.bulletText}>{h.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.cta}
              onPress={dismiss}
              activeOpacity={0.85}
            >
              <Check size={18} color="#fff" weight="bold" />
              <Text style={styles.ctaText}>Explore</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardWrap: { width: '100%', maxWidth: 440 },
  card: {
    borderRadius: 28,
    padding: 28,
    paddingTop: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  iconWrap: { alignSelf: 'center', marginBottom: 20 },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(232,168,56,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(232,168,56,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E8A838',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0d0510',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  bullets: {
    maxHeight: 320,
    marginBottom: 20,
  },
  bulletsContent: { gap: 14, paddingRight: 4 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  bulletIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,168,56,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(232,168,56,0.28)',
    marginTop: 1,
  },
  bulletTextCol: { flex: 1 },
  bulletTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  bulletText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    backgroundColor: '#E8A838',
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
