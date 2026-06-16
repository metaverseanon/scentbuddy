---
name: ScentBuddy free-tier limits
description: Where the free-plan caps live and how they are enforced across screens
---

# ScentBuddy free-tier limits

Free-plan caps: collection = 5 fragrances, active goals = 1.

The caps are **client-enforced and duplicated per screen** — there is no shared exported constant.
- Collection cap (5) is checked in `app/(tabs)/collection/index.tsx` and again in `app/scanner.tsx` (both define their own `FREE_COLLECTION_LIMIT = 5`, and the scanner re-checks the count inside the add-to-collection mutation against Supabase).
- Goal cap (1) lives in `app/goals.tsx` as `FREE_GOAL_LIMIT = 1`.

**Why:** the scanner historically had its own divergent cap (was 20 while collection was lower); a user decision aligned the free collection cap to 5 *everywhere*. Because the constant is redeclared in each file, the two can silently drift again.

**How to apply:** when changing a free cap, update every screen that declares it (grep `FREE_COLLECTION_LIMIT` / `FREE_GOAL_LIMIT`) AND any server-side/RPC enforcement. Caps are currently only client-side, so they are bypassable by a malicious client — treat real enforcement as a separate server-side task.

Pro detection must be `useRevenueCat().isPro` only — never `profiles.is_pro` (that column is a mirror). The `UsageMeter` component and all gating rely on this.
