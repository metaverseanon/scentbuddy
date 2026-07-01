---
name: Paywall single-instance guard
description: Why a global guard is needed so expo-router can't stack two identical fullScreenModal paywalls (the "second paywall freezes" bug).
---

# Paywall single-instance guard

On first app open, several independent triggers can each `router.push('/paywall')`
almost simultaneously (post-onboarding push, PaywallPromptProvider app-start/
foreground prompt, milestone push, plus user-tap upgrade buttons). expo-router
happily stacks two identical `fullScreenModal` routes; dismissing the top one
reveals a second that is left frozen (can't scroll/tap/dismiss).

**Rule:** every paywall opener must go through one global module-level guard
(`lib/paywallGuard.ts` → `openPaywallOnce(push)`), and the paywall screen must be
the authoritative owner of the flag via mount/unmount.

**Why:** a `pathname === '/paywall'` check in the prompt provider is not enough —
`usePathname` updates asynchronously, so near-simultaneous pushes in the same JS
tick both pass it. A synchronous module flag is the only thing that blocks the
race before any screen mounts.

**How to apply:**
- `openPaywallOnce` sets the flag synchronously *before* `router.push`; second
  callers in the same tick get a no-op. Wrap the push in try/catch and release
  the flag on throw.
- The paywall screen calls `markPaywallMounted()` on mount and
  `markPaywallUnmounted()` on unmount — unmount is the sole normal release, so the
  flag can never get permanently stuck (which would block ALL future paywalls).
- Add a mount watchdog: if the screen never mounts after a push (silently
  swallowed), release the flag after a few seconds.
- In the prompt provider, also gate `isEligible()` on `isPaywallOpen()` so a
  guard-suppressed attempt doesn't consume/skew the open-count cadence; on the
  rare post-threshold race, roll `OPEN_COUNT` back to its pre-increment value.
- When adding ANY new paywall entry point, route it through `openPaywallOnce` —
  a raw `router.push('/paywall')` reintroduces the freeze.
