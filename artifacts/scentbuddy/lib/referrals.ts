import { supabase } from '@/lib/supabase';
import { getPendingReferralCode, clearPendingReferralCode } from '@/lib/referralLink';

export const REFERRAL_GOAL = 5;
export const REFERRAL_SHARE_URL = 'https://scentbuddy.io/join';

// Reconcile referral-earned Pro for the CURRENT authenticated user. The server
// derives the user from the JWT and ignores any body, so this can never grant
// Pro to anyone else. Idempotent — safe to call on every Referrals-screen open.
export async function grantReferralProViaRevenueCat(): Promise<{ granted: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('grant-referral-pro', {
      body: {},
    });
    if (error) {
      console.log('[referrals] grant-referral-pro error:', error);
      return null;
    }
    console.log('[referrals] grant-referral-pro response:', data);
    return data as { granted: number };
  } catch (e) {
    console.log('[referrals] grant-referral-pro threw:', e);
    return null;
  }
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: 'pending' | 'completed';
  created_at: string;
  completed_at: string | null;
  referred_profile?: {
    display_name: string | null;
    username: string | null;
    avatar_emoji: string | null;
    avatar_url: string | null;
    is_pro: boolean | null;
  };
}

export interface ReferralStats {
  referralCode: string;
  totalReferred: number;
  completedReferrals: number;
  rewardGranted: boolean;
  monthsEarned: number;
  proExpiresAt: string | null;
  nextRewardIn: number;
  currentCycleProgress: number;
}

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) {
    d.setUTCDate(0);
  }
  return d.toISOString();
}

export function generateReferralCode(username: string | null, userId: string): string {
  const base = username || userId.slice(0, 6);
  const suffix = userId.slice(-4).toUpperCase();
  return `${base.toUpperCase().replace(/[^A-Z0-9]/g, '')}-${suffix}`;
}

export async function getOrCreateReferralCode(userId: string, username: string | null): Promise<string> {
  console.log('Getting or creating referral code for user:', userId);

  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.referral_code) {
    console.log('Found referral code on profile:', profile.referral_code);
    return profile.referral_code;
  }

  const code = generateReferralCode(username, userId);
  console.log('Generated new referral code:', code);

  await supabase
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId);

  return code;
}

export async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  console.log('Fetching referral stats for user:', userId);

  // NOTE: Pro status itself is owned by RevenueCat (useRevenueCat().isPro). The
  // columns read here are a display-only mirror written by the server when Pro
  // months are granted — they are never used as the Pro source of truth.
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code, pro_expires_at, referral_reward_months')
    .eq('id', userId)
    .maybeSingle();

  const referralCode = profile?.referral_code || '';

  const { data: referrals, error } = await supabase
    .from('user_referrals')
    .select('id, status')
    .eq('referrer_id', userId);

  if (error) {
    console.log('Error fetching referrals:', error);
  }

  const totalReferred = referrals?.length ?? 0;
  const completedReferrals = referrals?.filter(r => r.status === 'completed').length ?? 0;

  const monthsEarned = profile?.referral_reward_months ?? Math.floor(completedReferrals / REFERRAL_GOAL);
  const currentCycleProgress = completedReferrals % REFERRAL_GOAL;
  const nextRewardIn = REFERRAL_GOAL - currentCycleProgress;
  const proExpiresAt = profile?.pro_expires_at ?? null;
  const hasActiveReward = !!proExpiresAt && new Date(proExpiresAt) > new Date();

  return {
    referralCode,
    totalReferred,
    completedReferrals,
    rewardGranted: hasActiveReward,
    monthsEarned,
    proExpiresAt,
    nextRewardIn,
    currentCycleProgress,
  };
}

export async function fetchReferralsList(userId: string): Promise<Referral[]> {
  console.log('Fetching referrals list for user:', userId);

  const { data, error } = await supabase
    .from('user_referrals')
    .select(`
      id,
      referrer_id,
      referred_id,
      referral_code,
      status,
      created_at,
      completed_at,
      referred_profile:profiles!user_referrals_referred_id_fkey(
        display_name,
        username,
        avatar_emoji,
        avatar_url,
        is_pro
      )
    `)
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Error fetching referrals list:', error);
    return [];
  }

  return (data as unknown as Referral[]) ?? [];
}

export interface RecordReferralResult {
  ok: boolean;
  attributed?: boolean;
  reason?: string;
}

// Attribute the current authenticated user to a referrer via the secure Edge
// Function. The referred id is taken from the JWT server-side; we only send the
// code. The server resolves the referrer, rejects self/duplicate/invalid codes,
// writes the referral with the service role, and reconciles the referrer's Pro.
export async function recordReferralSignupViaServer(referralCode: string): Promise<RecordReferralResult> {
  const code = referralCode.trim().toUpperCase();
  if (!code) return { ok: true, attributed: false, reason: 'no_code' };
  try {
    const { data, error } = await supabase.functions.invoke('record-referral-signup', {
      body: { referralCode: code },
    });
    if (error) {
      console.log('[referrals] record-referral-signup error:', error);
      return { ok: false, reason: 'request_failed' };
    }
    console.log('[referrals] record-referral-signup response:', data);
    return data as RecordReferralResult;
  } catch (e) {
    console.log('[referrals] record-referral-signup threw:', e);
    return { ok: false, reason: 'request_failed' };
  }
}

// Reasons that mean "stop retrying" — clear the stored code.
const TERMINAL_REASONS = new Set([
  'no_code',
  'invalid_code',
  'self_referral',
  'already_attributed',
  'account_too_old',
]);

// Called once the user is authenticated: if a referral code is pending, attribute
// it. Transient failures (e.g. profile_not_ready, network) keep the code so it is
// retried on a later launch; terminal outcomes clear it.
export async function consumePendingReferral(): Promise<void> {
  const code = await getPendingReferralCode();
  if (!code) return;
  const result = await recordReferralSignupViaServer(code);
  const terminal = result.ok || (!!result.reason && TERMINAL_REASONS.has(result.reason));
  if (terminal) {
    await clearPendingReferralCode();
  }
}

export function getReferralShareMessage(code: string): string {
  return `Join me on ScentBuddy — the best way to track your fragrance collection! Use my referral code: ${code}\n\n${REFERRAL_SHARE_URL}?ref=${code}`;
}
