// record-referral-signup
//
// Securely attributes a new signup to a referrer. The referred user is taken
// from the verified JWT (NEVER the request body), so it cannot be forged. The
// body carries only the referral code. The row is written with the service role
// (clients have no write access to user_referrals), then the referrer's rewards
// are reconciled.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { reconcileReferralRewards } from '../_shared/reconcile.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ ok: false, reason: 'unauthorized' }, 401);

  // Identify the caller from the JWT — this is the referred user.
  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const referredId = userData.user.id;

  // Referrals reward bringing NEW friends. Only attribute accounts created within
  // a freshness window so an existing account can't click a link to be counted.
  // The window is generous because a deep-link install may sit unsigned-up for a
  // while; once they do sign up, created_at is recent.
  const ACCOUNT_FRESHNESS_MS = 24 * 60 * 60 * 1000;
  const createdAt = userData.user.created_at;
  if (createdAt && Date.now() - new Date(createdAt).getTime() > ACCOUNT_FRESHNESS_MS) {
    return json({ ok: true, attributed: false, reason: 'account_too_old' });
  }

  let parsed: { referralCode?: string };
  try {
    parsed = await req.json();
  } catch {
    parsed = {};
  }
  const code = (parsed.referralCode ?? '').trim().toUpperCase();
  if (!code) return json({ ok: true, attributed: false, reason: 'no_code' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Resolve the referrer from the code.
  const { data: referrer } = await admin
    .from('profiles')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle();
  if (!referrer) return json({ ok: true, attributed: false, reason: 'invalid_code' });
  if (referrer.id === referredId) return json({ ok: true, attributed: false, reason: 'self_referral' });

  // Already attributed? (unique(referred_id) also guards this at the DB level.)
  const { data: existing } = await admin
    .from('user_referrals')
    .select('id')
    .eq('referred_id', referredId)
    .maybeSingle();
  if (existing) return json({ ok: true, attributed: false, reason: 'already_attributed' });

  const { error: insertErr } = await admin.from('user_referrals').insert({
    referrer_id: referrer.id,
    referred_id: referredId,
    referral_code: code,
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
  if (insertErr) {
    const pgCode = (insertErr as { code?: string }).code;
    if (pgCode === '23505') {
      // Unique violation (race) — already attributed.
      return json({ ok: true, attributed: false, reason: 'already_attributed' });
    }
    if (pgCode === '23503') {
      // FK violation — the referred profile row isn't created yet. Transient:
      // the client keeps the pending code and retries on a later launch.
      return json({ ok: false, reason: 'profile_not_ready' }, 409);
    }
    return json({ ok: false, reason: 'insert_failed', detail: insertErr.message }, 500);
  }

  const reconcile = await reconcileReferralRewards(admin, referrer.id);
  return json({ ok: true, attributed: true, reconcile });
});
