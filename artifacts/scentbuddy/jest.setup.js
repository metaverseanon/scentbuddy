/* global jest */
const React = require('react');
const { View, Text } = require('react-native');

// --- Native / UI module stubs ---------------------------------------------

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BlurView: (props) => React.createElement(View, { ...props, testID: props.testID ?? 'blur-view' }),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props) => React.createElement(View, props, props.children) };
});

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(() => Promise.resolve('file:///tmp/card.png')),
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  saveToLibraryAsync: jest.fn(() => Promise.resolve()),
}));

// phosphor-react-native exports many named icon components — stub them all.
jest.mock('phosphor-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: () => (props) => React.createElement(Text, props, null),
    }
  );
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: (props) => React.createElement(View, props, props.children),
    SafeAreaView: (props) => React.createElement(View, props, props.children),
  };
});

// --- App lib stubs ---------------------------------------------------------

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn() },
  forceHttps: (url) => url,
}));

jest.mock('@/lib/analytics', () => ({
  logAnalyticsEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/lib/referrals', () => ({
  REFERRAL_SHARE_URL: 'https://scentbuddy.io/join',
  getOrCreateReferralCode: jest.fn(() => Promise.resolve('TESTCODE')),
}));

jest.mock('@/components/FeatureSpotlight', () => () => null);
