# ScentBuddy Supabase Edge Functions

Server-enforced referral rewards. These run on Supabase (Deno), not on Replit,
so they must be deployed with the Supabase CLI from your machine.

## Functions

- `record-referral-signup` — called after sign-up. Identifies the **referred**
  user from the verified JWT (never the body), resolves the referrer from the
  submitted code, rejects self/duplicate/invalid codes, inserts the referral with
  the service role, then reconciles the referrer's Pro.
- `grant-referral-pro` — idempotently reconciles referral-earned Pro for the
  **authenticated caller only** (referrer id from the JWT; body ignored). Safe to
  call on every Referrals-screen open.
- `_shared/reconcile.ts` — shared logic. Calls the `reconcile_referral_pro(uuid)`
  Postgres RPC, which is `SECURITY DEFINER` and takes a **per-referrer advisory
  lock**, so counting completed referrals, claiming new 5-invite milestones (in the
  `referral_reward_grants` ledger), and stacking the expiry on the `profiles` mirror
  are serialized and cannot double-grant or lose a month. It then grants real Pro
  via the RevenueCat REST API using the authoritative expiry, and re-reads + re-pushes
  if a concurrent reconcile advanced it. Because the unconditional push runs on every
  call (RC `grant_entitlement` sets an absolute expiry), any residual gap self-heals
  on the next reconcile. The RPC's `EXECUTE` is granted to `service_role` only.

## Prerequisites

1. Apply the migration `supabase/migrations/2026_06_referral_pro.sql` (paste into
   the Supabase SQL editor, or `supabase db push`). It is idempotent.
2. Set the function secrets:

```bash
supabase secrets set \
  REVENUECAT_SECRET_API_KEY=sk_xxx \
  REVENUECAT_PROJECT_ID=proj_xxx \
  REVENUECAT_ENTITLEMENT_ID="Scent Buddy Pro"
```

   - `REVENUECAT_SECRET_API_KEY` — a RevenueCat **v2 secret API key** (Project
     settings → API keys). Must have permission to grant entitlements.
   - `REVENUECAT_PROJECT_ID` — the RevenueCat project id.
   - `REVENUECAT_ENTITLEMENT_ID` — the entitlement identifier. Defaults to
     `Scent Buddy Pro` (the same identifier the app checks). If grants fail with
     "entitlement not found", set this to the entitlement's object id (`entl_...`).

   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
   provided automatically by the Edge runtime — do not set them manually.

## Deploy

```bash
supabase functions deploy record-referral-signup
supabase functions deploy grant-referral-pro
```

## How the grant works

The customer id used with RevenueCat is the Supabase `user.id` (the app calls
`Purchases.logIn(user.id)`). Each newly claimed milestone extends the customer's
entitlement by one month, stacked on any existing referral-granted expiry:

```
POST https://api.revenuecat.com/v2/projects/{project_id}/customers/{customer_id}/actions/grant_entitlement
Authorization: Bearer <REVENUECAT_SECRET_API_KEY>
{ "entitlement_id": "Scent Buddy Pro", "expires_at": <ms-since-epoch> }
```

Pro status itself remains owned by RevenueCat — the app gates on
`useRevenueCat().isPro`. The `profiles.pro_*` / `referral_reward_months` columns
are a display-only mirror.
