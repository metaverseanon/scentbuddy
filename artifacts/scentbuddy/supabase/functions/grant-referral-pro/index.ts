// grant-referral-pro
//
// Reconciles referral-earned Pro for the AUTHENTICATED caller only. The referrer
// id comes from the verified JWT; any request body is ignored, so a client can
// never trigger a grant for another user. Safe to call on every Referrals-screen
// open — the ledger makes it idempotent.

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

  const authClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
  const referrerId = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const result = await reconcileReferralRewards(admin, referrerId);
  return json({ ok: true, ...result });
});
