---
name: RevenueCat offering identifier collisions
description: Package identifiers ($rc_annual/$rc_monthly) repeat across offerings; select by identifier from the active offering's list and never store the package OBJECT in state (object-identity selection freezes the JS thread on refetch).
---

RevenueCat package identifiers (e.g. `$rc_annual`, `$rc_monthly`) are scoped per
*offering*, not globally unique. Multiple offerings (e.g. a standard offering and a
`winback` discount offering) routinely contain packages with the SAME identifier but
different underlying products/prices. WITHIN a single offering, however, the package
identifier IS the unique key of `availablePackages` (more unique than
`product.identifier`, since two package slots can point at the same product).

**Rule:** track the selection by the stable package IDENTIFIER string scoped to the
currently active offering's list, and DERIVE the package object from that active list
on each render. Do this even for a multi-offering paywall (win-back / A/B / promos):
because you resolve from the active list, switching offerings re-resolves to the
correct discounted object automatically.

**Never store the `PurchasesPackage` OBJECT in React state and compare by reference
(`list.includes(selectedPkg)`).** The SDK returns brand-new package objects on every
`getOfferings()` refetch, and first login fires several rapid refetches/invalidations
(RevenueCat configure, `Purchases.logIn`, and AppState 'active' fired when a
fullScreenModal presents). Reference-based selection is invalidated on every refetch
→ `setState` re-select → render storm that NEVER settles → **JS thread frozen** (an
on-screen countdown stops ticking and all taps die). Symptom is "freezes only the
first time the paywall opens after onboarding/login."

**Why (older incident):** matching only by identifier across a CONCATENATED set let a
stale standard package stay "selected" after switching to the discount offering — UI
showed the discounted price but would charge full price. Deriving from the *active*
list (never concatenating standard + win-back) avoids this entirely.

**How to apply:** any RevenueCat paywall. See `artifacts/scentbuddy/app/paywall.tsx`
(`selectedId` state + `selectedPkg` derived via `useMemo` from `activeList` + the
selection effect's `activeList.some(p => p.identifier === selectedId)` early-return).
Also avoid `new Animated.Value(...)` inside a render/`.map` on the paywall — its 1s
countdown re-renders the screen continuously and leaks native nodes; memoize them.
