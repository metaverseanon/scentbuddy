# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains ScentBuddy — a React Native / Expo mobile app for fragrance tracking, collection management, and community features.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile app**: Expo (React Native) — `artifacts/scentbuddy`
- **API framework**: Express 5 — `artifacts/api-server`
- **Database**: PostgreSQL + Drizzle ORM (for future use)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Supabase (existing Supabase project)
- **AI**: OpenAI via Replit AI Integrations (fragrance scanner + social trends)
- **Payments**: RevenueCat (in-app subscriptions)
- **Product analytics**: PostHog (`posthog-react-native`) — autocapture + funnel events
- **Icons**: phosphor-react-native, lucide-react-native, @expo/vector-icons

## ScentBuddy App

Fragrance tracking and discovery app originally built with Rork, migrated to Replit.

### Features
- Fragrance collection management
- Wishlist
- Community / social feed (who's wearing what today)
- AI-powered barcode scanner + photo recognition for fragrances
- Fragrance DNA (scent profile)
- Statistics and diary
- Scent goals
- **Referral-earned Pro** (`app/referrals.tsx`) — inviting friends grants REAL Pro time: every 5 completed referrals = 1 free month, **server-enforced and idempotent**. Pro source of truth is the RevenueCat entitlement `Scent Buddy Pro` ONLY (`useRevenueCat().isPro`); `profiles.pro_*` + `referral_reward_months` are a display-only mirror, never the gate. Attribution flow: a `?ref=CODE` deep link (or sign-up form) is captured to AsyncStorage (`lib/referralLink.ts`), then attributed once authenticated via the `record-referral-signup` Edge Function — `referred_id` is taken from the JWT (never the body), so it can't be forged. Rewards are reconciled by the `grant-referral-pro` Edge Function (caller-from-JWT only), which claims milestones atomically against the `referral_reward_grants` ledger and grants Pro via the RevenueCat REST API. Clients have READ-only RLS on referral tables; all writes are service-role. Ships JS-only via EAS Update (no new native modules). **Edge Functions + migration must be deployed from a machine with the Supabase CLI — they can't be deployed/tested from Replit** (see `supabase/functions/README.md`).
- Paywall / Pro subscription via RevenueCat — **conversion-optimized**: paywall pushed at end of onboarding (right after quiz), `PaywallPromptProvider` trigger thresholds = 1 open before first show / 2 between / 12h interval. Paywall copy is benefit-led ("Discover scents you'll actually love") with social proof, testimonial, anchor pricing ($71.90 → $35.95/yr 50% off, monthly $5.99 always full price), and free-vs-Pro contrasts. Plans render dynamically from the active RevenueCat offering's `availablePackages` — `app/paywall.tsx` detects each plan via `isAnnualPlan`/`isMonthlyPlan`/`isWeeklyPlan` (product id `sb_yearly`/`sb_monthly`/`sb_weekly` OR `$rc_annual`/`$rc_monthly`/`$rc_weekly` OR packageType), labels/period/CTA/analytics-plan (`yearly`/`monthly`/`weekly`) derive from those helpers, and cards sort Yearly → Monthly → Weekly via `planOrder`. Adding a new plan to the offering surfaces it automatically; no allowlist filtering. (Note: win-back eligibility still compares only annual/monthly prices.) Onboarding sets `paywall_last_shown_at` before pushing to avoid immediate re-trigger. **No free trial** (per user preference)
- **Win-back discount** (`app/paywall.tsx`, `lib/winback.ts`) — repeat paywall dismissers see a one-time real discount. Eligibility: an offline-reliable local dismiss counter (`lib/winback.ts`, AsyncStorage) incremented on every STANDARD paywall dismissal; once it reaches `WINBACK_DISMISS_THRESHOLD` (3) and the offer has not yet been shown, the next eligible paywall renders win-back mode. Shown at most once per user (`@scentbuddy:winback_offer_shown` flag set on display) and suppressed for Pro (`isPro`). **Pricing is REAL**: win-back packages come from a dedicated RevenueCat offering with identifier `winback` (exposed as `useRevenueCat().winbackPackages`); savings % is computed against the live standard annual price (no fabricated urgency/countdown). **Prerequisite**: the `winback` offering + its discounted products must be configured in RevenueCat and the app stores; if absent, `winbackPackages` is empty and the paywall degrades gracefully to standard pricing. Funnel events logged distinctly: `winback_offer_shown` / `winback_offer_tapped` / `winback_purchase_completed`, plus a `variant: 'winback' | 'standard'` prop on `paywall_dismissed` / `paywall_purchase_tapped` / `purchase_completed`. Purchase reuses the existing RevenueCat flow. Ships JS-only via EAS Update.
- Supabase backend for auth and data
- **Sign in with Apple** (`app/login.tsx`, `providers/AuthProvider.tsx`) — native iOS Apple auth via `expo-apple-authentication` (button is iOS-only via `Platform.OS`). Flow: generate a random raw nonce → pass its SHA-256 hash (`expo-crypto`) to `AppleAuthentication.signInAsync` → exchange `credential.identityToken` via `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce: rawNonce })`. **Nonce binding is required** (replay protection): Apple echoes the hashed nonce into the token claim and Supabase re-hashes the raw nonce to verify. Apple only returns name/email on the FIRST authorization, so first-time users are provisioned via the shared `provisionNewUser()` helper (profile upsert + onboarding quiz + starter collection + registration analytics + referral attribution) with an auto-generated unique username; returning users (or any profile-lookup error) skip provisioning and fire login analytics — never re-provision, since that would overwrite an existing profile's username/referral_code/is_pro. `signInWithApple`/`signInWithAppleLoading`/`signInWithAppleError` exposed from `useAuth()`. **Prerequisites (external, NOT doable from Replit)**: (1) enable the Apple provider in the Supabase dashboard (Auth → Providers → Apple) and add the iOS bundle ID `app.rork.0kxdwz3d5g57j5m9vjhxs` to authorized Client IDs; (2) the App ID must have the "Sign in with Apple" capability; (3) **requires an EAS native rebuild** — new native module (`expo-apple-authentication`) + `ios.usesAppleSignIn: true` entitlement in `app.json`, so this is NOT a JS-only EAS Update.
- **Sign in with Google** (`app/login.tsx`, `providers/AuthProvider.tsx`) — native Google auth via `@react-native-google-signin/google-signin` (button shown on all native platforms via `Platform.OS !== 'web'`). Flow: `GoogleSignin.configure({ webClientId, iosClientId })` from `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` → `signIn()` → exchange `response.data.idToken` via `supabase.auth.signInWithIdToken({ provider: 'google', token })`. **No nonce is passed** for Google native (unlike Apple) — secure nonce binding (`GoogleSignin.signIn({ nonce })`) is a PAID-tier feature of the library, so the free package can't inject a matching nonce. To avoid the iOS error *"Passed nonce and nonce in id_token should either both exist or not"*, the Supabase Google provider must have **"Skip nonce check" enabled** (see prerequisite 5). Cancellations (typed `statusCodes.SIGN_IN_CANCELLED` / `IN_PROGRESS`, plus the non-throwing `!isSuccessResponse` case and legacy code `12501`) are mapped to `ERR_REQUEST_CANCELED` and swallowed by the UI. First-time users are provisioned via the shared `provisionNewUser()` helper with an auto-generated unique username + Google display name; returning users (or any profile-lookup error) skip provisioning and fire login analytics (never re-provision). `signInWithGoogle`/`signInWithGoogleLoading`/`signInWithGoogleError` exposed from `useAuth()`. **Prerequisites (external, NOT doable from Replit)**: (1) create OAuth credentials in Google Cloud Console — an **iOS** client ID (its *reversed* form goes into `app.json` → the `@react-native-google-signin/google-signin` plugin `iosUrlScheme`, currently a `REPLACE_WITH_REVERSED_IOS_CLIENT_ID` placeholder) and a **Web** client ID (used as `webClientId`); (2) set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` before bundling (EXPO_PUBLIC vars are inlined at build time); (3) enable the Google provider in the Supabase dashboard and add the iOS + Web client IDs to its authorized Client IDs; (4) **requires an EAS native rebuild** (new native module + `iosUrlScheme` — NOT a JS-only EAS Update); (5) **enable "Skip nonce check"** under Supabase → Authentication → Providers → Google (server-side toggle, fixes already-installed builds instantly) — without it iOS Google sign-in fails with the nonce error above, because the free library tier cannot pass a matching nonce.
- **Twin Finder** (`app/twin-finder.tsx`) — finds users with the most overlap in collection (shared bottles + shared notes). Free: top 3, Pro: top 100. Server-enforced via `get_twin_matches` RPC; client cannot bypass the cap.
- **Group Blind Test** (`app/blind-test/index.tsx`, `app/blind-test/[id].tsx`) — pick a fragrance from collection, share a blind link, friends rate notes/family without seeing the name. Server-side redaction via `get_blind_test` and `get_ratable_blind_tests` RPCs; the perfume name/brand/image are never sent to a non-creator until they have submitted a rating.
- **Community Posts** — users can post text (up to 1000 chars) + optional image to the Feed tab. Compose box at the top of the Feed tab; posts render above the existing activity items. Images uploaded to Supabase storage `post-images` bucket (public read, owner-only write/delete). Stored in `community_posts` table with RLS (anyone can read, only owner can insert/delete).
- **Monthly Wrapped** (`app/monthly-wrapped.tsx`) — Spotify-Wrapped-style recap with shareable card via `react-native-view-shot`. Notification scheduled for 1st of every month at 10 AM via `NotificationProvider` (deep-link route: `/monthly-wrapped`).
- **Shareable Wrapped growth loop** (`app/monthly-wrapped.tsx`, `app/weekly-recap.tsx`) — both recaps are tuned as a viral install loop. Each captured card carries subtle ScentBuddy attribution + a visible referral join URL (`REFERRAL_SHARE_URL` + the signed-in user's `?ref=CODE` from `getOrCreateReferralCode`), so screenshots shared to vertical social drive installs/TikTok funnel. The native share message embeds the same `joinUrl`. **DEEPER recap insights are Pro-gated** (display-only gate via `useRevenueCat().isPro` ONLY): free users see the core recap plus a "Deeper insights" section rendered **BLURRED** (`expo-blur` BlurView) with masked `••••••` placeholders and a Pro unlock overlay — real deeper values are NEVER rendered for non-Pro (hard gate). Unlock routes to the paywall via `usePaywallPrompt().openPaywall(...)` (sources `monthly_wrapped_deeper_insights` / `weekly_recap_deeper_insights`) plus a "See everything in Pro" link to `/pro-overview`. All deeper insights are computed from REAL already-queried data (no fabricated stats). Funnel analytics via `logAnalyticsEvent` (props carry `recap_type: 'monthly' | 'weekly'`, `source`, `period_label`, `is_pro`): `recap_share_started/completed/failed`, `recap_card_saved`, `recap_deeper_insights_locked_viewed` (once per period), `recap_deeper_insights_unlock_tapped`, `recap_deeper_insights_pro_overview_tapped`. Icons are phosphor (no emojis). Ships JS-only via EAS Update (no new native modules). Note: weekly Avg Rating stays a free stat card (not duplicated as a locked deeper insight).
- **Discovery row** in Community tab linking to the three above features.

### Supabase Migrations
- `artifacts/scentbuddy/supabase/migrations/2026_05_community_posts.sql` — creates `community_posts` table, RLS, and `post-images` storage bucket with owner-scoped policies. Idempotent.
- `artifacts/scentbuddy/supabase/migrations/2026_05_blind_tests.sql` — creates `blind_tests`, `blind_test_ratings` tables, RLS, plus SECURITY DEFINER RPCs `get_blind_test`, `get_ratable_blind_tests`, `get_twin_matches`. Idempotent — paste into the Supabase SQL editor to apply.
- `artifacts/scentbuddy/supabase/migrations/2026_06_streak_leaderboard.sql` — adds the `get_streak_leaderboard(limit_count)` SECURITY DEFINER RPC powering the **Log Streaks** leaderboard category (Community → Leaderboard). Computes each user's current consecutive-day wear streak (distinct days ending today/yesterday, UTC, "islands" SQL) over the owner-scoped `wear_diary` table; returns only `(user_id, streak)`. `revoke execute from public` + `grant to authenticated`; limit clamped 1–100. Idempotent — paste into the Supabase SQL editor to apply (until applied, the Log Streaks tab degrades to an empty state).
- `artifacts/scentbuddy/supabase/migrations/2026_06_referral_pro.sql` — referral-earned Pro: adds `profiles` columns (`referral_code` unique, `referral_reward_months`, `pro_expires_at`, `pro_since`, `pro_source`), `user_referrals` (FKs → profiles `ON DELETE CASCADE`, `unique(referred_id)`, keeps the `user_referrals_referred_id_fkey` name for the PostgREST embed), and the `referral_reward_grants` ledger (PK `referrer_id, milestone_number`). RLS = read-own-only; no client writes. Idempotent.

### Supabase Edge Functions
- `artifacts/scentbuddy/supabase/functions/` — Deno functions for referral-earned Pro: `record-referral-signup`, `grant-referral-pro`, shared `_shared/reconcile.ts` + `_shared/cors.ts`. Excluded from the Expo tsconfig (`exclude: ["supabase/functions"]`) since they are Deno, not RN. Deploy with the Supabase CLI; see `supabase/functions/README.md`. Requires secrets `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_ENTITLEMENT_ID` (defaults to `Scent Buddy Pro`); `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the Edge runtime.

### Key Source Files
- `artifacts/scentbuddy/app/_layout.tsx` — root layout, providers, onboarding gating
- `artifacts/scentbuddy/providers/` — Auth, Theme, RevenueCat, Notification, Paywall providers
- `artifacts/scentbuddy/lib/supabase.ts` — Supabase client and helpers
- `artifacts/scentbuddy/lib/types.ts` — shared TypeScript types
- `artifacts/scentbuddy/constants/themes.ts` — color themes
- `artifacts/api-server/src/routes/ai.ts` — AI endpoints (identify-fragrance, social-trends)

### Environment Variables Needed
- `EXPO_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
- `EXPO_PUBLIC_REVENUECAT_API_KEY` — RevenueCat API key
- `EXPO_PUBLIC_API_URL` — base URL for the API server
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — Google OAuth **Web** client ID (used as `webClientId` for native Google sign-in token audience)
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` — Google OAuth **iOS** client ID
- `EXPO_PUBLIC_POSTHOG_KEY` — PostHog project (client) API key, `phc_...` (write-only, safe in public apps)
- `EXPO_PUBLIC_POSTHOG_HOST` — PostHog host (`https://us.i.posthog.com` US / `https://eu.i.posthog.com` EU)
- `EXPO_PUBLIC_APPSFLYER_DEV_KEY` — AppsFlyer dev key (required for native SDK init)
- `EXPO_PUBLIC_TIKTOK_APP_ID` — TikTok Business App ID (numeric, e.g. `7630509545810411528`)
- `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` — TikTok Events Manager access token (required for SDK init)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — set by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_API_KEY` — set by Replit AI Integrations

### Attribution / Analytics SDKs
- AppsFlyer: native SDK only via `react-native-appsflyer` (config plugin in `app.json`). Initialized in `lib/appsflyer.ts`, fired from `app/_layout.tsx`. Events: `af_login`, `af_complete_registration`, `af_start_trial`, `af_subscribe`, `af_purchase`. Install/launch are auto-tracked by the SDK.
- TikTok Business: native SDK via `react-native-tiktok-business-sdk` (autolinked, no plugin). Initialized in `lib/tiktok.ts`, fired from `app/_layout.tsx`. Events: `Login`, `Registration`, `StartTrial`, `Subscribe`, `PURCHASE` (content event).
- All Supabase Edge Function tracking has been removed — events go directly through the native SDKs.
- PostHog: JS-only `posthog-react-native` client in `lib/posthog.ts` (singleton, web/no-key safe). `lib/analytics.ts`'s `logAnalyticsEvent` mirrors every event into PostHog and identifies the signed-in user. App wrapped in `PostHogProvider` (autocapture) in `app/_layout.tsx`. Ships via EAS Update (no native rebuild).

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scentbuddy test` — run the Expo app's Jest component tests (jest-expo)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
