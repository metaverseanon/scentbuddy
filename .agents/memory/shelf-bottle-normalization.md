---
name: Shelf bottle image normalization
description: How ScentBuddy makes collection "shelf" bottles render at a uniform size, and the cost rule for re-sizing.
---

# Shelf bottle uniformity

Bottles on the collection "My Shelf" look uniform only if the stored CLEAN
images are consistently framed — the renderer (`ShelfView`, expo-image
`contentFit="contain"`) can't fix inconsistent source framing. Normalization is
done server-side (`api-server` `/api/images/normalize`, Jimp): crop to the alpha
bounding box, scale the bottle's **height** to a fixed fraction of the canvas,
clamp width for boxed/wide items, cap upscale, then composite
horizontally-centered + **bottom-aligned** (bottles stand on the shelf).

**Why height-based + bottom-aligned:** real bottles on a shelf share a height
and a baseline, not a bounding-box-fit. Earlier bounding-box-fit + centered
scaling made tall vs wide bottles look different sizes.

## Cost rule — NEVER re-run background removal just to re-size
Background removal (removal.ai) costs credits per call; normalization (our Jimp
server) is free. To re-size EXISTING bottles, re-run normalization ONLY on the
existing `clean_image_url` (`renormalizeCleanFragranceImage`) — do not call the
full `processFragranceImage` (which re-removes the background). Only items that
have a raw `image_url` but no clean image should hit the full paid pipeline.

**How to apply:** any "resize / re-clean shelf" action must branch per item:
clean image present → free renormalize; raw-only → full pipeline. The renormalize
path must fail loudly (return null) if normalization is unavailable, not
re-upload the same image as a false success.

## Rollout
Server normalization change only takes effect in the app once the API server is
**deployed** and `EXPO_PUBLIC_API_URL` is set; the Expo JS change ships via EAS
Update; then the user taps "Resize bottles".
