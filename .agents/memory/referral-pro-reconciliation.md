---
name: Referral-Pro reconciliation
description: How ScentBuddy grants real Pro time for referral milestones safely.
---

# Referral-Pro reconciliation (ScentBuddy)

Inviting friends grants REAL Pro: every 5 completed referrals = 1 month. Pro is
gated ONLY by the RevenueCat entitlement `Scent Buddy Pro` (`useRevenueCat().isPro`);
`profiles.pro_*` + `referral_reward_months` are a display-only mirror.

## Rules / decisions
- **Reconciliation must be serialized per referrer.** It runs inside the
  `reconcile_referral_pro(uuid)` SECURITY DEFINER RPC, which takes
  `pg_advisory_xact_lock(hashtext('refpro:'||referrer))` before the
  read-count → compute-expiry → write sequence.
  **Why:** the naive supabase-js "count then update `pro_expires_at`" races — two
  concurrent milestone crossings both read the old expiry and one month is lost.
- **Milestones go straight to `granted` under the lock (no `pending` state), and the
  Edge Function re-pushes the authoritative absolute expiry to RevenueCat on EVERY
  reconcile call, not only when new months were earned.**
  **Why:** RC `grant_entitlement` sets an absolute expiry; re-pushing the stored
  value self-heals a transient RC failure or out-of-order write, and avoids the
  "stuck pending milestone that never retries" failure mode.
- **`referred_id`/`referrer_id` always come from the JWT (`auth.getUser()`), never the
  request body.** Clients have READ-only RLS on referral tables; all writes are
  service-role. Self-grant / forged-attribution is therefore not possible.
- **Signup-freshness:** `record-referral-signup` only attributes accounts whose
  `auth.user.created_at` is within ~24h, so an existing account can't click a link
  to be counted. Terminal reason `account_too_old` (client clears the pending code).

## How to apply
Any change to milestone math, expiry stacking, or the grant flow goes through the
RPC + the `_shared/reconcile.ts` helper together — keep the lock and the RC re-push.
