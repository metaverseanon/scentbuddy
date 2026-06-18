---
name: Where fragrance notes come from
description: Why scanner-added collection items can have empty notes, and which source actually has top/heart/base notes.
---

# Fragrance notes source vs. the photo scanner

The photo-scan AI endpoint (`/ai/identify-fragrance`) returns ONLY `name`,
`brand`, `confidence` — it does NOT return notes. So a fragrance added purely from
a scan can land in `user_collections` with empty `top_notes/heart_notes/base_notes`.

**Where notes actually live:** the external fragrance search API
(`searchFragrances()` → `SEARCH_BASE_URL/api/search`) returns full
`topNotes/heartNotes/baseNotes` (plus accords, etc.) per result. The scanner shows
search results and maps those notes when the user picks one — but if the picked
result lacked notes, or the item was added another way, notes stay empty.

**Consequence:** `analyzeFragranceProfile([],[],[])` hits its no-data fallback
(0.5 for every season + day/night), which surfaced as "50% everywhere" in the
collection detail modal. It now returns `hasData:false` on that fallback so the UI
can hide season/time sections instead of showing fake placeholders.

**How to apply:** if you need notes for a collection/wishlist item that has none,
enrich from `searchFragrances(`${name} ${brand}`)` (match on name, then brand) and
backfill the row — don't expect the scan AI to provide them.
