---
name: EXPO_PUBLIC_ vars + EAS Update timing
description: Why a new EXPO_PUBLIC_ env var only reaches the app after an eas update bundled with it present, not from an existing native build.
---

# EXPO_PUBLIC_ env vars are inlined at JS bundle time

`EXPO_PUBLIC_*` values are **inlined into the JS bundle when it is built**, not
read at runtime from the device.

**Why this matters for OTA:**
- A native build (e.g. an existing TestFlight build) only contains the
  EXPO_PUBLIC values that existed in the environment **when that build was made**.
  Adding a brand-new EXPO_PUBLIC var afterward does NOT appear in that build.
- It reaches the device only via a new JS bundle: run `eas update`, which inlines
  whatever EXPO_PUBLIC vars are present **in the shell environment at update time**,
  then OTA-delivers that bundle to the matching runtimeVersion build.

**How to apply:**
- Set the EXPO_PUBLIC var in the Replit env (shared) BEFORE running `eas update`,
  so the value is in `process.env` when the bundle is built. (Replit shared env
  vars are available in the workspace Shell.)
- Then publish: `cd artifacts/<app> && EAS_NO_VCS=1 eas update --branch <channel>
  --message "..." --non-interactive`.
- Don't expect a previously-built binary to pick up a new EXPO_PUBLIC var on its
  own — it needs the OTA bundle (or a fresh native build) that was built with the
  var present.
