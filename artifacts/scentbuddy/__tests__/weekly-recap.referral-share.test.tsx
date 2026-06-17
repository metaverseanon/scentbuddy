import React from 'react';
import { render } from '@testing-library/react-native';

import { useQuery } from '@tanstack/react-query';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { WearDiaryEntry } from '@/lib/types';

import WeeklyRecapScreen from '@/app/weekly-recap';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));

const mockPush = jest.fn();
const mockOpenPaywall = jest.fn();

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
  { id: 'w1', user_id: 'user-1', perfume_name: 'Layton', perfume_brand: 'PdM', date: '2026-06-15', note: null, image_url: null, occasion: null, mood: null, rating: 5, sprays: 2, created_at: '2026-06-15' },
  { id: 'w2', user_id: 'user-1', perfume_name: 'Oud Satin', perfume_brand: 'MFK', date: '2026-06-16', note: null, image_url: null, occasion: null, mood: null, rating: 3, sprays: 2, created_at: '2026-06-16' },
];

type RefState = { data: string | null; isLoading: boolean };

function mockQueries(referral: RefState) {
  (useQuery as jest.Mock).mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    if (key === 'weekly-recap-wears') return { data: wears, isLoading: false };
    if (key === 'weekly-recap-collection') return { data: [], isLoading: false };
    if (key === 'weekly-recap-wishlist') return { data: [], isLoading: false };
    if (key === 'weekly-recap-referral-code') return referral;
    return { data: undefined, isLoading: false };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });
});

describe('WeeklyRecap referral-attributed share', () => {
  it('disables Save/Share and shows a loading state while the referral code is resolving', () => {
    mockQueries({ data: null, isLoading: true });

    const { getByLabelText, queryByText } = render(<WeeklyRecapScreen />);

    // Save/Share must be disabled so a card cannot be captured before the
    // referral code settles (which would produce an unattributed share).
    expect(getByLabelText('Save recap card')).toBeDisabled();
    expect(getByLabelText('Share recap card')).toBeDisabled();

    // Buttons render their spinner instead of the idle labels.
    expect(queryByText('Save')).toBeNull();
    expect(queryByText('Share')).toBeNull();
  });

  it('enables Save/Share and stamps the card footer with ?ref=CODE once the code settles', () => {
    mockQueries({ data: 'TESTCODE', isLoading: false });

    const { getByLabelText, getByText } = render(<WeeklyRecapScreen />);

    expect(getByLabelText('Save recap card')).toBeEnabled();
    expect(getByLabelText('Share recap card')).toBeEnabled();

    // The captured card footer carries the user's personal referral link.
    expect(getByText('scentbuddy.io/join?ref=TESTCODE')).toBeTruthy();
  });

  it('degrades gracefully to the generic join link when there is no referral code (signed-out / error)', () => {
    mockQueries({ data: null, isLoading: false });

    const { getByLabelText, getByText, queryByText } = render(<WeeklyRecapScreen />);

    // Not loading, so sharing is allowed even without a code.
    expect(getByLabelText('Save recap card')).toBeEnabled();
    expect(getByLabelText('Share recap card')).toBeEnabled();

    // Footer falls back to the generic link, never a malformed `?ref=`.
    expect(getByText('scentbuddy.io/join')).toBeTruthy();
    expect(queryByText(/\?ref=/)).toBeNull();
  });
});
