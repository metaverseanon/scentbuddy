---
name: RevenueCat isPro flicker on mount
description: How to render Pro/free-gated UI in ScentBuddy without flashing the wrong state while RevenueCat resolves.
---

# RevenueCat isPro flicker

`useRevenueCat().isPro` defaults to `false` and only becomes accurate after
`customerInfo` resolves. On a freshly mounted screen a real Pro user can briefly
read as non-Pro, which flashes a locked/upsell state at them before flipping.

**Rule:** for any screen that swaps between locked-upsell and unlocked states,
derive a `proKnown = !isLoadingCustomerInfo` (both exposed by the provider) and
only commit to the locked/unlocked branch once `proKnown` is true. While unknown,
render a neutral state and disable any paywall CTA.

**Why:** without the gate, Pro users opening an upsell/benefits surface see a
locked, blurred, "buy now" version of content they already own — a jarring bug
that also pollutes conversion analytics.

**How to apply:** `lockedState = proKnown && !isPro`, `unlockedState = proKnown && isPro`.
Pattern is used by `app/pro-overview.tsx`; reuse it for future conversion screens
(referral-Pro, win-back, etc.). Pro status is `useRevenueCat().isPro` ONLY — never
`profiles.is_pro`. Note: a disabled RevenueCat query (web / Expo Go, not configured)
reports `isLoadingCustomerInfo === false`, so `proKnown` is immediately true there.
