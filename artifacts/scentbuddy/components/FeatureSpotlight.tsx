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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Check, X, Sparkle } from 'phosphor-react-native';

export type SpotlightBullet = {
  icon: React.ElementType;
  text: string;
};

type Props = {
  storageKey: string;
  icon: React.ElementType;
  iconColor: string;
  gradientColors: [string, string, string];
  title: string;
  subtitle: string;
  bullets: SpotlightBullet[];
  ctaLabel?: string;
};

const SPOTLIGHT_PREFIX = 'scentbuddy_spotlight_';

export async function resetFeatureSpotlights() {
  const keys = ['twin_finder', 'blind_test', 'monthly_wrapped'];
  await Promise.all(
    keys.map(k => AsyncStorage.removeItem(`${SPOTLIGHT_PREFIX}${k}`).catch(() => {}))
  );
}

export default function FeatureSpotlight({
  storageKey,
  icon: Icon,
  iconColor,
  gradientColors,
  title,
  subtitle,
  bullets,
  ctaLabel = 'Got it',
}: Props) {
  const [visible, setVisible] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const fullKey = `${SPOTLIGHT_PREFIX}${storageKey}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(fullKey);
        if (!cancelled && !seen) {
          setVisible(true);
        }
      } catch (e) {
        console.log('[FeatureSpotlight] read failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    ]).start(() => {
      setVisible(false);
    });
    try {
      await AsyncStorage.setItem(fullKey, '1');
    } catch (e) {
      console.log('[FeatureSpotlight] persist failed', e);
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
            colors={gradientColors}
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
              <View style={[styles.iconRing, { borderColor: iconColor + '40' }]}>
                <View style={[styles.iconInner, { backgroundColor: iconColor + '22' }]}>
                  <Icon size={36} color={iconColor} weight="duotone" />
                </View>
              </View>
              <View style={[styles.sparkleBadge, { backgroundColor: iconColor }]}>
                <Sparkle size={12} color="#fff" weight="fill" />
              </View>
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            <View style={styles.bullets}>
              {bullets.map((b, i) => {
                const BIcon = b.icon;
                return (
                  <View key={i} style={styles.bulletRow}>
                    <View
                      style={[
                        styles.bulletIconWrap,
                        { backgroundColor: iconColor + '20', borderColor: iconColor + '30' },
                      ]}
                    >
                      <BIcon size={14} color={iconColor} weight="bold" />
                    </View>
                    <Text style={styles.bulletText}>{b.text}</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: iconColor }]}
              onPress={dismiss}
              activeOpacity={0.85}
            >
              <Check size={18} color="#fff" weight="bold" />
              <Text style={styles.ctaText}>{ctaLabel}</Text>
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
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 420,
  },
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
  iconWrap: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0d0510',
  },
  title: {
    color: '#fff',
    fontSize: 24,
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
    gap: 12,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulletIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bulletText: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
