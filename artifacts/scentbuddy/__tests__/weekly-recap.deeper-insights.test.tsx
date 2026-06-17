import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { useQuery } from '@tanstack/react-query';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { logAnalyticsEvent } from '@/lib/analytics';
import { WearDiaryEntry } from '@/lib/types';

import WeeklyRecapScreen from '@/app/weekly-recap';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));

const mockOpenPaywall = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'fan@scent.io' },
    profile: { username: 'fan', display_name: 'Fan' },
  }),
}));

jest.mock('@/providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      accent: '#e87090',
      text: '#fff',
      subtext: '#999',
      card: '#111',
      border: '#222',
      chip: '#333',
    },
  }),
}));

jest.mock('@/providers/RevenueCatProvider', () => ({
  useRevenueCat: jest.fn(),
}));

jest.mock('@/providers/PaywallPromptProvider', () => ({
  usePaywallPrompt: () => ({ openPaywall: mockOpenPaywall }),
}));

const wears: WearDiaryEntry[] = [
  { id: 'w1', user_id: 'user-1', perfume_name: 'Layton', perfume_brand: 'PdM', date: '2026-06-15', note: null, image_url: null, occasion: 'OfficeGala', mood: 'Euphoric', rating: 5, sprays: 2, created_at: '2026-06-15' },
  { id: 'w2', user_id: 'user-1', perfume_name: 'Layton', perfume_brand: 'PdM', date: '2026-06-15', note: null, image_url: null, occasion: 'OfficeGala', mood: 'Euphoric', rating: 4, sprays: 2, created_at: '2026-06-15' },
  { id: 'w3', user_id: 'user-1', perfume_name: 'Oud Satin', perfume_brand: 'MFK', date: '2026-06-16', note: null, image_url: null, occasion: 'Casual', mood: 'Calm', rating: 3, sprays: 2, created_at: '2026-06-16' },
];

// Distinctive real deeper-insight values that MUST never leak to a non-Pro user.
// (occasion/mood also appear in the ungated wear diary, so we assert on the
// busiest-day and avg values which only ever appear in the deeper-insights card.)
const REAL_VALUES = ['Monday · 2×', '1.5'];
const DEEPER_ROW_COUNT = 4; // busiest day, avg wears/day, top occasion, top mood

function mockQueries() {
  (useQuery as jest.Mock).mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    if (key === 'weekly-recap-wears') return { data: wears, isLoading: false };
    if (key === 'weekly-recap-collection') return { data: [], isLoading: false };
    if (key === 'weekly-recap-wishlist') return { data: [], isLoading: false };
    if (key === 'weekly-recap-referral-code') return { data: 'TESTCODE', isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries();
});

describe('WeeklyRecap deeper insights gating', () => {
  it('never renders real deeper-insight values for a free user', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });

    const { queryByText, getAllByText } = render(<WeeklyRecapScreen />);

    for (const value of REAL_VALUES) {
      expect(queryByText(value)).toBeNull();
    }

    expect(getAllByText('••••••').length).toBe(DEEPER_ROW_COUNT);
    expect(queryByText('Unlock with Pro')).not.toBeNull();
    expect(queryByText('See everything in Pro')).not.toBeNull();
  });

  it('reveals real values and hides the lock for a Pro user', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: true });

    const { queryByText } = render(<WeeklyRecapScreen />);

    for (const value of REAL_VALUES) {
      expect(queryByText(value)).not.toBeNull();
    }

    expect(queryByText('••••••')).toBeNull();
    expect(queryByText('Unlock with Pro')).toBeNull();
    expect(queryByText('See everything in Pro')).toBeNull();
  });

  it('logs the locked-view event once and unlock/overview taps with is_pro', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });

    const { getByText } = render(<WeeklyRecapScreen />);

    const lockedCalls = (logAnalyticsEvent as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'recap_deeper_insights_locked_viewed'
    );
    expect(lockedCalls.length).toBe(1);
    expect(lockedCalls[0][1]).toMatchObject({ recap_type: 'weekly', is_pro: false });

    fireEvent.press(getByText('Unlock with Pro'));
    expect(logAnalyticsEvent).toHaveBeenCalledWith(
      'recap_deeper_insights_unlock_tapped',
      expect.objectContaining({ recap_type: 'weekly', is_pro: false })
    );
    expect(mockOpenPaywall).toHaveBeenCalledWith('weekly_recap_deeper_insights');

    fireEvent.press(getByText('See everything in Pro'));
    expect(logAnalyticsEvent).toHaveBeenCalledWith(
      'recap_deeper_insights_pro_overview_tapped',
      expect.objectContaining({ recap_type: 'weekly', is_pro: false })
    );
  });
});
