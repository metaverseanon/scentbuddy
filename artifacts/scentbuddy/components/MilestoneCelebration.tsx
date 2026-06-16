import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, Sparkle, X } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';

const GOLD = '#D4A574';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  ctaLabel: string;
  onContinue: () => void;
  onDismiss: () => void;
};

export default function MilestoneCelebration({
  visible,
  title,
  body,
  ctaLabel,
  onContinue,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      scale.setValue(0.92);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, scale, opacity]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onDismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={18} color={colors.subtext} weight="bold" />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <LinearGradient
              colors={[GOLD, '#B8895A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconCircle}
            >
              <Crown size={30} color="#fff" weight="fill" />
            </LinearGradient>
            <View style={styles.sparkleTopRight}>
              <Sparkle size={14} color={GOLD} weight="fill" />
            </View>
            <View style={styles.sparkleBottomLeft}>
              <Sparkle size={10} color={GOLD} weight="fill" />
            </View>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.subtext }]}>{body}</Text>

          <TouchableOpacity style={styles.cta} onPress={onContinue} activeOpacity={0.85}>
            <LinearGradient
              colors={[GOLD, '#C19A6B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaInner}
            >
              <Sparkle size={18} color="#fff" weight="fill" />
              <Text style={styles.ctaText}>{ctaLabel}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={[styles.dismissText, { color: colors.subtext }]}>Maybe later</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    borderWidth: 1,
    paddingTop: 36,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
    zIndex: 2,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleTopRight: {
    position: 'absolute',
    top: 0,
    right: 2,
  },
  sparkleBottomLeft: {
    position: 'absolute',
    bottom: 4,
    left: 0,
  },
  title: {
    fontSize: 21,
    fontWeight: '800' as const,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },
  cta: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  dismissBtn: {
    marginTop: 6,
    paddingVertical: 12,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
});
