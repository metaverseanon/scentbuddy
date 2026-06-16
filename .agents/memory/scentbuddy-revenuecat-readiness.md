---
name: ScentBuddy RevenueCat readiness/Pro gating
description: Non-obvious timing rules for gating UI on Pro status from useRevenueCat — read before adding any paywall/upsell trigger.
---

# Gating on Pro status from `useRevenueCat()`

When you only want something to happen for NON-Pro users (paywalls, upsell prompts,
milestone celebrations), you cannot just check `!isPro`. Two timing quirks make
that unsafe and can show paid-only nudges to actual Pro users:

1. **`isLoadingCustomerInfo` is false while RevenueCat is still configuring.**
   It maps to the customer-info query's `isLoading`, but that query is `enabled:
   configured`. Before `rcConfigured` is true the query is disabled, so
   `isLoadingCustomerInfo` is `false` AND `isPro` is still its default `false`.
   A "loading done, not Pro" reading during app start is a false negative.

2. **`isPro` lags one render behind `customerInfo`.** `isPro` is derived from
   `customerInfo` in an effect, so on the render where `customerInfo` first
   becomes non-null, `isPro` is still the old value for one commit.

**Rule:** treat Pro status as resolved only when `rcConfigured && customerInfo != null`.
For the actual Pro check, prefer a ref that mirrors `isPro` and re-check it AFTER
any `await` (e.g. an AsyncStorage read) — the await yields to the event loop, which
lets React flush the pending `isPro` update so the ref is current.

**Why:** the "never show to Pro users" guarantee is a hard constraint; showing a
paid-only prompt to a paying user is worse than failing to show it to a free user.
Gating on `customerInfo != null` also means an offline/errored RC session simply
skips the prompt (re-fires next successful session) instead of misclassifying.

**How to apply:** any new conversion trigger that branches on Pro status should
wait for this resolved state and use the post-await re-check pattern. See
`providers/MilestoneProvider.tsx` for the reference implementation (also uses a
synchronous claim lock so only one celebration fires per evaluation tick).
