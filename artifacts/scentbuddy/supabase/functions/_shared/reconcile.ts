// Shared reconciliation of referral-earned Pro time.
//
// The heavy lifting (counting completed referrals, claiming 5-invite milestones,
// computing the stacked expiry, and updating the display mirror) happens inside
// the `reconcile_referral_pro` Postgres function, which is serialized per-referrer
// with an advisory lock so concurrent callers can never double-grant or lose a
// month. Here we simply call that RPC and then push the authoritative expiry to
// RevenueCat. We re-push on every call (not only when new months were granted),
// so a transient RevenueCat failure or out-of-order write self-heals on the next
// reconcile — RC grant_entitlement sets an absolute expiry, so re-applying the
// stored value is safe and idempotent.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RC_PROJECT_ID = Deno.env.get('REVENUECAT_PROJECT_ID') ?? '';
const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_API_KEY') ?? '';
const RC_ENTITLEMENT = Deno.env.get('REVENUECAT_ENTITLEMENT_ID') ?? 'Scent Buddy Pro';

// RevenueCat REST API v2 — grant a promotional entitlement until `expiresAtMs`.
// POST /v2/projects/{project_id}/customers/{customer_id}/actions/grant_entitlement
// body: { entitlement_id, expires_at }  (expires_at = ms since epoch)
async function grantRevenueCatEntitlement(
  customerId: string,
  expiresAtMs: number,
): Promise<{ ok: boolean; detail?: string }> {
  if (!RC_PROJECT_ID || !RC_SECRET) {
    return { ok: false, detail: 'RevenueCat env not configured (REVENUECAT_PROJECT_ID / REVENUECAT_SECRET_API_KEY)' };
  }
  const url = `https://api.revenuecat.com/v2/projects/${RC_PROJECT_ID}/customers/${encodeURIComponent(customerId)}/actions/grant_entitlement`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RC_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ entitlement_id: RC_ENTITLEMENT, expires_at: expiresAtMs }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, detail: `RC ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: `RC request threw: ${String(e)}` };
  }
}

export interface ReconcileResult {
  granted: number; // months newly granted in THIS call
  monthsGranted: number; // total months ever granted to this referrer
  proExpiresAt: string | null;
  error?: string;
}

interface ReconcileRow {
  granted_now: number;
  months_total: number;
  pro_expires_at: string | null;
}

export async function reconcileReferralRewards(
  admin: SupabaseClient,
  referrerId: string,
): Promise<ReconcileResult> {
  // Atomic, serialized DB-side reconciliation (advisory-locked per referrer).
  const { data, error } = await admin.rpc('reconcile_referral_pro', { p_referrer: referrerId });
  if (error) {
    return { granted: 0, monthsGranted: 0, proExpiresAt: null, error: `reconcile rpc failed: ${error.message}` };
  }
  const row: ReconcileRow | undefined = Array.isArray(data) ? data[0] : (data as ReconcileRow | undefined);
  const granted = row?.granted_now ?? 0;
  const monthsGranted = row?.months_total ?? 0;
  const proExpiresAt = row?.pro_expires_at ?? null;

  // Push the authoritative expiry to RevenueCat while it's in the future. The DB
  // value is computed under a per-referrer advisory lock so it is always the
  // monotonic max, but the RC push happens after that transaction commits — so a
  // concurrent reconcile could have advanced the expiry in between. To avoid
  // leaving RC behind with a stale (shorter) absolute expiry, we re-read the
  // authoritative value once after the push and re-push if it grew. The
  // unconditional re-push on the *next* reconcile call additionally self-heals any
  // residual gap (RC grant_entitlement sets an absolute expiry, so re-applying is
  // idempotent and safe).
  let effectiveExpiry = proExpiresAt;
  if (effectiveExpiry && new Date(effectiveExpiry).getTime() > Date.now()) {
    const grant = await grantRevenueCatEntitlement(referrerId, new Date(effectiveExpiry).getTime());
    if (!grant.ok) {
      return { granted, monthsGranted, proExpiresAt: effectiveExpiry, error: grant.detail };
    }

    const { data: fresh } = await admin
      .from('profiles')
      .select('pro_expires_at')
      .eq('id', referrerId)
      .single();
    const freshExpiry: string | null = fresh?.pro_expires_at ?? null;
    if (freshExpiry && new Date(freshExpiry).getTime() > new Date(effectiveExpiry).getTime()) {
      const reGrant = await grantRevenueCatEntitlement(referrerId, new Date(freshExpiry).getTime());
      if (!reGrant.ok) {
        return { granted, monthsGranted, proExpiresAt: freshExpiry, error: reGrant.detail };
      }
      effectiveExpiry = freshExpiry;
    }
  }

  return { granted, monthsGranted, proExpiresAt: effectiveExpiry };
}
