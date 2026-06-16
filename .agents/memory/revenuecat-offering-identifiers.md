---
name: RevenueCat offering identifier collisions
description: Package identifiers ($rc_annual/$rc_monthly) repeat across offerings; select/purchase by the active offering's list, not by identifier alone.
---

RevenueCat package identifiers (e.g. `$rc_annual`, `$rc_monthly`) are scoped per
*offering*, not globally unique. Multiple offerings (e.g. a standard offering and a
`winback` discount offering) routinely contain packages with the SAME identifier but
different underlying products/prices.

**Rule:** when an app shows packages from more than one offering, resolve the package
to display/purchase from the *currently active offering's* list. Either track the
selected package by object identity, or re-resolve it from the active list by
identifier right before purchasing. Never assume a package identifier uniquely maps to
one product across offerings.

**Why:** matching a selected package only by identifier let a stale standard package
stay "selected" after switching to the discount offering — the UI showed the
discounted price but the purchase would have charged the full standard price.

**How to apply:** any multi-offering paywall (win-back, A/B price tests, promos). See
`artifacts/scentbuddy/app/paywall.tsx` (selection effect + handlePurchase).
