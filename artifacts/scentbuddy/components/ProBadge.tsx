import React from 'react';
import { StyleSheet } from 'react-native';
import { Crown } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  size?: 'xs' | 'sm' | 'md';
  style?: object;
};

export default function ProBadge({ size = 'sm', style }: Props) {
  const dims = SIZES[size];
  return (
    <LinearGradient
      colors={['#F4C95D', '#E8A838', '#C98A1F']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.badge,
        { width: dims.box, height: dims.box, borderRadius: dims.box / 2 },
        style,
      ]}
    >
      <Crown size={dims.icon} color="#fff" weight="fill" />
    </LinearGradient>
  );
}

const SIZES = {
  xs: { box: 16, icon: 10 },
  sm: { box: 20, icon: 12 },
  md: { box: 26, icon: 16 },
} as const;

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
