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
- Referrals
- Paywall / Pro subscription via RevenueCat
- Supabase backend for auth and data

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
- `EXPO_PUBLIC_APPSFLYER_DEV_KEY` — AppsFlyer dev key (required for native SDK init)
- `EXPO_PUBLIC_TIKTOK_APP_ID` — TikTok Business App ID (numeric, e.g. `7630509545810411528`)
- `EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN` — TikTok Events Manager access token (required for SDK init)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — set by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_API_KEY` — set by Replit AI Integrations

### Attribution / Analytics SDKs
- AppsFlyer: native SDK only via `react-native-appsflyer` (config plugin in `app.json`). Initialized in `lib/appsflyer.ts`, fired from `app/_layout.tsx`. Events: `af_login`, `af_complete_registration`, `af_start_trial`, `af_subscribe`, `af_purchase`. Install/launch are auto-tracked by the SDK.
- TikTok Business: native SDK via `react-native-tiktok-business-sdk` (autolinked, no plugin). Initialized in `lib/tiktok.ts`, fired from `app/_layout.tsx`. Events: `Login`, `Registration`, `StartTrial`, `Subscribe`, `PURCHASE` (content event).
- All Supabase Edge Function tracking has been removed — events go directly through the native SDKs.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
