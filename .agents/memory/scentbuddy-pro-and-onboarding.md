---
name: ScentBuddy Pro entitlement & onboarding rendering
description: Two non-obvious architectural constraints that repeatedly cause bugs in the ScentBuddy Expo app.
---

# Pro source of truth
Pro status MUST come from RevenueCat entitlement `Scent Buddy Pro` via `useRevenueCat().isPro`.
`profiles.is_pro` is a one-way mirror, NOT the source of truth.

**Why:** Gating on `profile?.is_pro` incorrectly blocks entitled users (the mirror lags / can be stale),
breaking the paywall-conversion flow. A scanner add-to-collection gate had this exact bug.
**How to apply:** Any free-vs-Pro gate (collection add limit 5, scanner add limit 20, goals 1, shelf view,
twin finder, etc.) must read `useRevenueCat().isPro`, never `profiles.is_pro`.

# Onboarding renders pre-auth, outside the router Stack
`app/onboarding.tsx` is shown by `_layout.tsx` based on AsyncStorage `scentbuddy_onboarding_done`,
BEFORE auth and OUTSIDE the expo-router Stack.

**Why:** You cannot `router.push` to new screens for onboarding sub-steps — there is no Stack yet.
**How to apply:** New onboarding steps must be in-component phases (e.g. a `phase` state machine).
Any data the user produces pre-auth (quiz results, starter collection picks) must persist to AsyncStorage
and be synced into Supabase at `signUp` in `AuthProvider`. When syncing, only delete the AsyncStorage key
AFTER a successful insert, so transient/RLS failures don't silently lose the user's data.
