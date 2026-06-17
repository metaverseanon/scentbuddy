import React from 'react';
import { render } from '@testing-library/react-native';

import { useQuery } from '@tanstack/react-query';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { CollectionItem, WearDiaryEntry } from '@/lib/types';

import MonthlyWrappedScreen from '@/app/monthly-wrapped';

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

jest.mock('@/providers/RevenueCatProvider', () => ({
  useRevenueCat: jest.fn(),
}));

jest.mock('@/providers/PaywallPromptProvider', () => ({
  usePaywallPrompt: () => ({ openPaywall: mockOpenPaywall }),
}));

const wears: WearDiaryEntry[] = [
  { id: 'w1', user_id: 'user-1', perfume_name: 'Aventus', perfume_brand: 'Creed', date: '2026-05-10', note: null, image_url: null, occasion: null, mood: null, rating: 5, sprays: 2, created_at: '2026-05-10' },
  { id: 'w2', user_id: 'user-1', perfume_name: 'Sauvage', perfume_brand: 'Dior', date: '2026-05-11', note: null, image_url: null, occasion: null, mood: null, rating: 4, sprays: 2, created_at: '2026-05-11' },
];

const collection: CollectionItem[] = [
  { id: 'c1', user_id: 'user-1', perfume_name: 'Aventus', perfume_brand: 'Creed', concentration: null, season: null, occasion: null, top_notes: [], heart_notes: [], base_notes: [], image_url: null, clean_image_url: null, rating: 5, personal_notes: null, is_favorite: true, purchase_price: null, date_added: null, created_at: '2026-01-01', status: 'owned', fill_level: 80 },
];

type RefState = { data: string | null; isLoading: boolean };

function mockQueries(referral: RefState) {
  (useQuery as jest.Mock).mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    const key = queryKey[0];
    if (key === 'monthly-wrapped-wears') return { data: wears, isLoading: false };
    if (key === 'monthly-wrapped-collection') return { data: collection, isLoading: false };
    if (key === 'monthly-wrapped-new') return { data: [], isLoading: false };
    if (key === 'monthly-wrapped-referral-code') return referral;
    return { data: undefined, isLoading: false };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRevenueCat as jest.Mock).mockReturnValue({ isPro: false });
});

describe('MonthlyWrapped referral-attributed share', () => {
  it('disables Save/Share and shows a loading state while the referral code is resolving', () => {
    mockQueries({ data: null, isLoading: true });

    const { getByLabelText, queryByText } = render(<MonthlyWrappedScreen />);

    // Save/Share must be disabled so a card cannot be captured before the
    // referral code settles (which would produce an unattributed share).
    expect(getByLabelText('Save Wrapped card')).toBeDisabled();
    expect(getByLabelText('Share Wrapped card')).toBeDisabled();

    // Buttons render their spinner instead of the idle labels.
    expect(queryByText('Save')).toBeNull();
    expect(queryByText('Share Wrapped')).toBeNull();
  });

  it('enables Save/Share and stamps the card footer with ?ref=CODE once the code settles', () => {
    mockQueries({ data: 'TESTCODE', isLoading: false });

    const { getByLabelText, getByText } = render(<MonthlyWrappedScreen />);

    expect(getByLabelText('Save Wrapped card')).toBeEnabled();
    expect(getByLabelText('Share Wrapped card')).toBeEnabled();

    // The captured card footer carries the user's personal referral link.
    expect(getByText('scentbuddy.io/join?ref=TESTCODE')).toBeTruthy();
  });

  it('degrades gracefully to the generic join link when there is no referral code (signed-out / error)', () => {
    mockQueries({ data: null, isLoading: false });

    const { getByLabelText, getByText, queryByText } = render(<MonthlyWrappedScreen />);

    // Not loading, so sharing is allowed even without a code.
    expect(getByLabelText('Save Wrapped card')).toBeEnabled();
    expect(getByLabelText('Share Wrapped card')).toBeEnabled();

    // Footer falls back to the generic link, never a malformed `?ref=`.
    expect(getByText('scentbuddy.io/join')).toBeTruthy();
    expect(queryByText(/\?ref=/)).toBeNull();
  });
});
