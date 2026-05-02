import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Crown } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  style?: object;
};

export default function ProBadge({ size = 'sm', showLabel = true, style }: Props) {
  const dims = SIZES[size];
  return (
    <LinearGradient
      colors={['#F4C95D', '#E8A838', '#C98A1F']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badge,
        { paddingHorizontal: dims.padX, paddingVertical: dims.padY, borderRadius: dims.radius, gap: dims.gap },
        style,
      ]}
    >
      <Crown size={dims.icon} color="#fff" weight="fill" />
      {showLabel && (
        <Text style={[styles.label, { fontSize: dims.font }]}>PRO</Text>
      )}
    </LinearGradient>
  );
}

const SIZES = {
  xs: { icon: 9, font: 9, padX: 5, padY: 2, radius: 6, gap: 3 },
  sm: { icon: 11, font: 10, padX: 7, padY: 3, radius: 8, gap: 4 },
  md: { icon: 13, font: 12, padX: 9, padY: 4, radius: 10, gap: 5 },
} as const;

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  label: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
