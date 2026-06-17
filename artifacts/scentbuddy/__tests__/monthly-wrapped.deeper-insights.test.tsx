import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { useQuery } from '@tanstack/react-query';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { logAnalyticsEvent } from '@/lib/analytics';
import { CollectionItem, WearDiaryEntry } from '@/lib/types';

import MonthlyWrappedScreen from '@/app/monthly-wrapped';

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

jest.mock('@/providers/RevenueCatProvider', () => ({
  useRevenueCat: jest.fn(),
}));

jest.mock('@/providers/PaywallPromptProvider', () => ({
  usePaywallPrompt: () => ({ openPaywall: mockOpenPaywall }),
}));

const wears: WearDiaryEntry[] = [
  { id: 'w1', user_id: 'user-1', perfume_name: 'Aventus', perfume_brand: 'Creed', date: '2026-05-10', note: null, image_url: null, occasion: null, mood: null, rating: 5, sprays: 2, created_at: '2026-05-10' },
  { id: 'w2', user_id: 'user-1', perfume_name: 'Aventus', perfume_brand: 'Creed', date: '2026-05-10', note: null, image_url: null, occasion: null, mood: null, rating: 5, sprays: 2, created_at: '2026-05-10' },
  { id: 'w3', user_id: 'user-1', perfume_name: 'Sauvage', perfume_brand: 'Dior', date: '2026-05-11', note: null, image_url: null, occasion: null, mood: null, rating: 4, sprays: 2, created_at: '2026-05-11' },
];

// Notes are intentionally empty so no "Scent families explored" row is added —
// this keeps the set of deeper-insight rows deterministic (exactly 4).
const collection: CollectionItem[] = [
  { id: 'c1', user_id: 'user-1', perfume_name: 'Aventus', perfume_brand: 'Creed', concentration: null, season: null, occasion: null, top_notes: [], heart_notes: [], base_notes: [], image_url: null, clean_image_url: null, rating: 5, personal_notes: null, is_favorite: true, purchase_price: null, date_added: null, created_at: '2026-01-01', status: 'owned', fill_level: 80 },
  { id: 'c2', user_id: 'user-1', perfume_name: 'Sauvage', perfume_brand: 'Dior', concentration: null, season: null, occasion: null, top_notes: [], heart_notes: [], base_notes: [], image_url: null, clean_image_url: null, rating: 4, personal_notes: null, is_favorite: false, purchase_price: null, date_added: null, created_at: '2026-01-01', status: 'owned', fill_level: 90 },
  { id: 'c3', user_id: 'user-1', perfume_name: 'Unworn', perfume_brand: 'Brand', concentration: null, season: null, occasion: null, top_notes: [], heart_notes: [], base_notes: [], image_url: null, clean_image_url: null, rating: null, personal_notes: null, is_favorite: false, purchase_price: null, date_added: null, created_at: '2026-01-01', status: 'owned', fill_level: 100 },
];

// The real deeper-insight values that MUST never leak to a non-Pro user.
const REAL_VALUES = ['May 10 · 2×', '1.5', '67% · Aventus', '2 of 3'];

function mockQueries() {
  (useQuery as jest.Mock).mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    if (key === 'monthly-wrapped-wears') return { data: wears, isLoading: false };
    if (key === 'monthly-wrapped-collection') return { data: collection, isLoading: false };
    if (key === 'monthly-wrapped-new') return { data: [], isLoading: false };
    if (key === 'monthly-wrapped-referral-code') return { data: 'TESTCODE', isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueries();
});

describe('MonthlyWrapped deeper insights gating', () => {
  it('never renders real deeper-insight values for a free user', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });

    const { queryByText, getAllByText } = render(<MonthlyWrappedScreen />);

    // Real values are absent from the rendered tree.
    for (const value of REAL_VALUES) {
      expect(queryByText(value)).toBeNull();
    }

    // Every insight row is masked, and the lock overlay is present.
    expect(getAllByText('••••••').length).toBe(REAL_VALUES.length);
    expect(queryByText('Unlock with Pro')).not.toBeNull();
    expect(queryByText('See everything in Pro')).not.toBeNull();
  });

  it('reveals real values and hides the lock for a Pro user', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: true });

    const { queryByText } = render(<MonthlyWrappedScreen />);

    for (const value of REAL_VALUES) {
      expect(queryByText(value)).not.toBeNull();
    }

    expect(queryByText('••••••')).toBeNull();
    expect(queryByText('Unlock with Pro')).toBeNull();
    expect(queryByText('See everything in Pro')).toBeNull();
  });

  it('logs the locked-view event once and unlock/overview taps with is_pro', () => {
    (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });

    const { getByText } = render(<MonthlyWrappedScreen />);

    const lockedCalls = (logAnalyticsEvent as jest.Mock).mock.calls.filter(
      (c) => c[0] === 'recap_deeper_insights_locked_viewed'
    );
    expect(lockedCalls.length).toBe(1);
    expect(lockedCalls[0][1]).toMatchObject({ recap_type: 'monthly', is_pro: false });

    fireEvent.press(getByText('Unlock with Pro'));
    expect(logAnalyticsEvent).toHaveBeenCalledWith(
      'recap_deeper_insights_unlock_tapped',
      expect.objectContaining({ recap_type: 'monthly', is_pro: false })
    );
    expect(mockOpenPaywall).toHaveBeenCalledWith('monthly_wrapped_deeper_insights');

    fireEvent.press(getByText('See everything in Pro'));
    expect(logAnalyticsEvent).toHaveBeenCalledWith(
      'recap_deeper_insights_pro_overview_tapped',
      expect.objectContaining({ recap_type: 'monthly', is_pro: false })
    );
  });
});
