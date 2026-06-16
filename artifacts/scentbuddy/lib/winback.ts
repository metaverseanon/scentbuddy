import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISS_COUNT_KEY = '@scentbuddy:paywall_dismiss_count';
const WINBACK_SHOWN_KEY = '@scentbuddy:winback_offer_shown';

export const WINBACK_DISMISS_THRESHOLD = 3;

export async function getPaywallDismissCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_COUNT_KEY);
    const count = raw ? parseInt(raw, 10) : 0;
    return Number.isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

export async function incrementPaywallDismissCount(): Promise<number> {
  try {
    const current = await getPaywallDismissCount();
    const next = current + 1;
    await AsyncStorage.setItem(DISMISS_COUNT_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

export async function hasWinbackBeenShown(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WINBACK_SHOWN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markWinbackShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(WINBACK_SHOWN_KEY, '1');
  } catch {
    // best-effort: a missed write only means the user may see the offer again,
    // which is still gated by the dismiss threshold and the Pro check.
  }
}

/**
 * A user qualifies for the one-time win-back offer once they have dismissed the
 * standard paywall at least WINBACK_DISMISS_THRESHOLD times and have not already
 * been shown the offer. Callers MUST additionally verify the user is not Pro and
 * that a real discounted offering is available before presenting it.
 */
export async function isWinbackEligible(): Promise<boolean> {
  const [count, shown] = await Promise.all([
    getPaywallDismissCount(),
    hasWinbackBeenShown(),
  ]);
  return count >= WINBACK_DISMISS_THRESHOLD && !shown;
}
