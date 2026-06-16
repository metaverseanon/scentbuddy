import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Crown, CaretRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/providers/ThemeProvider';
import { useRevenueCat } from '@/providers/RevenueCatProvider';

interface UsageMeterProps {
  /** Short title shown on the left, e.g. "Free collection". */
  label: string;
  /** Real current usage count. */
  current: number;
  /** Free-plan limit for this resource. */
  limit: number;
  /** Distinct paywall source tag for funnel analytics, e.g. "limit_collection". */
  source: string;
  containerStyle?: StyleProp<ViewStyle>;
}

const WARN_COLOR = '#FFA726';
const FULL_COLOR = '#E74C3C';

export default function UsageMeter({
  label,
  current,
  limit,
  source,
  containerStyle,
}: UsageMeterProps) {
  const { isPro } = useRevenueCat();
  const { colors } = useTheme();
  const router = useRouter();

  // Pro users never see usage meters.
  if (isPro) return null;
  if (limit <= 0) return null;

  const ratio = Math.min(1, Math.max(0, current / limit));
  const remaining = Math.max(0, limit - current);
  const atLimit = current >= limit;
  const nearLimit = !atLimit && remaining <= Math.max(1, Math.ceil(limit * 0.3));

  const barColor = atLimit ? FULL_COLOR : nearLimit ? WARN_COLOR : colors.accent;

  let subtext: string;
  if (atLimit) {
    subtext = 'Limit reached — unlock unlimited with Pro';
  } else if (nearLimit) {
    subtext = `Only ${remaining} left — go unlimited with Pro`;
  } else {
    subtext = 'Go unlimited with Pro';
  }

  const onPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/paywall?source=${source}` as never);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.container,
        {
          backgroundColor: colors.card,
          borderColor: atLimit ? barColor : colors.border,
        },
        containerStyle,
      ]}
    >
      <View style={styles.topRow}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.count, { color: atLimit ? FULL_COLOR : colors.subtext }]}>
          {Math.min(current, limit)} / {limit}
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.cta}>
          <Crown size={13} color={colors.accent} weight="fill" />
          <Text style={[styles.subtext, { color: colors.accent }]}>{subtext}</Text>
        </View>
        <CaretRight size={13} color={colors.subtext} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  subtext: {
    fontSize: 12,
    fontWeight: '600',
  },
});
