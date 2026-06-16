---
name: ScentBuddy Supabase Edge Functions
description: How ScentBuddy's Deno Edge Functions coexist with the Expo TS app and how they ship.
---

# ScentBuddy Supabase Edge Functions

ScentBuddy keeps server logic in Supabase Edge Functions (Deno) under
`artifacts/scentbuddy/supabase/functions/`.

- These files use URL imports (`https://esm.sh/...`) and the global `Deno`, which
  the Expo/RN `tsc` cannot resolve. **The Expo `tsconfig.json` must list
  `"exclude": ["supabase/functions"]`** or `pnpm --filter @workspace/scentbuddy run typecheck`
  fails with TS2307 (esm.sh module not found) and TS2304 (Deno not found).
  **Why:** they are two different runtimes sharing one folder; don't delete the exclude.

- **Edge Functions and SQL migrations cannot be deployed or tested from Replit.**
  The deliverable from this environment is source + migration + `functions/README.md`.
  Deployment happens on a machine with the Supabase CLI. Verify correctness by
  reading (no runtime here), so be extra careful with raw SQL/PL-pgSQL.

- PL/pgSQL gotcha hit here: in `INSERT ... ON CONFLICT DO UPDATE`, reference the
  target table by its **relation name** (`referral_reward_grants.col`), never
  schema-qualified (`public.referral_reward_grants.col`) — the latter doesn't parse.
