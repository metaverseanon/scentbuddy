import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

// A referral code captured from a deep link / manual entry, held until the user
// has an authenticated session and we can attribute it server-side.
const PENDING_REFERRAL_KEY = 'scentbuddy_pending_referral';

export async function getPendingReferralCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return null;
  }
}

export async function setPendingReferralCode(code: string): Promise<void> {
  try {
    const trimmed = code.trim().toUpperCase();
    if (trimmed) {
      await AsyncStorage.setItem(PENDING_REFERRAL_KEY, trimmed);
    } else {
      await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
    }
  } catch {
    // best-effort
  }
}

export async function clearPendingReferralCode(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // best-effort
  }
}

// Pull a `?ref=CODE` query param out of a deep link URL.
export function extractReferralCode(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const ref = parsed.queryParams?.ref;
    const value = Array.isArray(ref) ? ref[0] : ref;
    if (typeof value === 'string' && value.trim()) {
      return value.trim().toUpperCase();
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

// Capture the referral code from the launch URL and any deep links opened while
// the app is running, persisting it for attribution after sign-up.
export function useCaptureReferralLink(): void {
  useEffect(() => {
    let active = true;
    void Linking.getInitialURL().then((url) => {
      const code = extractReferralCode(url);
      if (active && code) void setPendingReferralCode(code);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = extractReferralCode(url);
      if (code) void setPendingReferralCode(code);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
}
