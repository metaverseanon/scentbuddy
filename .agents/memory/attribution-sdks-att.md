---
name: Attribution SDKs + ATT (ScentBuddy)
description: How AppsFlyer / TikTok / Meta native attribution and iOS App Tracking Transparency fit together in the Expo app.
---

- ScentBuddy ships THREE native attribution SDKs side by side: AppsFlyer, TikTok Business, and Meta (`react-native-fbsdk-next`). Each has a `lib/<sdk>.ts` wrapper using a lazy-require (web no-op) plus an `Events` object. All are inited in `app/_layout.tsx` and fired from the SAME call sites: AuthProvider (login / registration) and RevenueCatProvider (startTrial / subscribe / purchase). Add any new attribution event to all three together.

- There is ONE App Tracking Transparency prompt (`expo-tracking-transparency`) and it serves all three SDKs. Before Meta was added there was NO ATT prompt at all — even though AppsFlyer was configured with `timeToWaitForATTUserAuthorization:10` — so the IDFA was never actually available. The ATT request lives in `initMeta()`; its result gates Meta `advertiserTrackingEnabled` and simultaneously unlocks the IDFA for AppsFlyer/TikTok.
  **Why:** iOS 14.5+ returns a zeroed IDFA until the user authorizes ATT; with no prompt, all three SDKs run ID-less.

- Meta fbsdk-next on Expo: `clientToken` and the Meta App ID MUST be literal strings in `app.json` (static JSON, no env interpolation). Both are embedded in the app binary — public client config, not secrets. Pull the actual values from `app.json`, not from memory.

- The fbsdk-next Expo config plugin auto-injects SKAdNetwork IDs (`v9wttpbfk9` + `n38lu8286q`) into Info.plist at prebuild with de-duping, so manual `ios.infoPlist.SKAdNetworkItems` entries are optional and safe to list redundantly.

- Set fbsdk `isAutoInitEnabled: false` so the SDK initializes only from JS AFTER the ATT prompt resolves (consent gate). PII / advanced-matching (`setUserData({ email })`) is sent only when ATT is granted.
  **Why:** auto-init + auto-log before consent is an App Store privacy-review risk.

- Adding Meta is a NEW native module → requires an EAS native rebuild, NOT just an EAS Update (see `eas-build-from-replit`).
