---
name: ScentBuddy paywall funnel instrumentation
description: How paywall analytics events are fired and gated, and why the dismiss path uses an unmount cleanup.
---

# Paywall funnel events
Events log to Supabase `analytics_events` via `logAnalyticsEvent(event, props)` (fire-and-forget `void`).
The paywall is reached via `router.push({ pathname: '/paywall', params: { source } })`; `source` is read
with `useLocalSearchParams` and threaded from every entry point (onboarding, PaywallPrompt trigger,
twin_finder, fragrance_dna, manual).

# Dismiss is logged on unmount, not in the close handler
`paywall_dismissed` fires from a `useEffect(() => () => {...}, [])` cleanup, guarded by
`dismissLoggedRef` and `convertedRef`, reading `source` from a `sourceRef`.

**Why:** The X button is only one exit path — hardware back and swipe-back gestures unmount the screen
without calling the close handler, so logging only in `handleClose` under-counts dismissals. Conversion
also unmounts the screen, so `convertedRef` (set on purchase success AND whenever `isPro` flips true,
covering restore) prevents a purchase from being miscounted as a dismiss.
**How to apply:** When instrumenting "abandon" events on a screen with multiple exit paths, prefer an
unmount cleanup with a converted-guard over per-button handlers. Use refs (not state) so the cleanup
closure reads current values. `paywall_viewed` uses a `viewedLoggedRef` guard to fire once per mount.

# Locked Pro content must be hard-gated, not just blurred
Blurring real values (e.g. fragrance-dna Deeper Insights) still ships the data in the rendered tree.
For non-Pro, render masked placeholders (`••••••••`) instead of the real value; keep BlurView only as
visual polish on top of already-masked content.
