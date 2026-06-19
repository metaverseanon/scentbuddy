---
name: Google Sign-In iOS modular headers (Expo)
description: Why @react-native-google-signin breaks CocoaPods on Expo iOS and the per-pod modular_headers fix
---

# Google Sign-In iOS pod install failure (Expo prebuild)

`@react-native-google-signin/google-signin` (v16) pulls in `GoogleSignIn` → `AppCheckCore`,
which is a Swift pod that depends on `GoogleUtilities` and `RecaptchaInterop`. Those two do
**not** define modules, so CocoaPods fails at the **Install pods** phase with:

> [!] The following Swift pods cannot yet be integrated as static libraries:
> The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`,
> which do not define modules. ... set `use_modular_headers!` globally ... or
> specify `:modular_headers => true` for particular dependencies.

## Fix (chosen): per-pod modular headers via a Podfile config plugin

A `withDangerousMod` Expo config plugin appends, after `use_expo_modules!` in the Podfile:

```ruby
pod 'GoogleUtilities', :modular_headers => true
pod 'RecaptchaInterop', :modular_headers => true
```

**Why this over `expo-build-properties` `useFrameworks: "static"`:** switching every pod to
static frameworks is a big hammer that risks new linkage errors across the app's other native
SDKs (RevenueCat, FBSDK, AppsFlyer, TikTok). The per-pod fix targets exactly the two
non-modular pods the error names, and matches the codebase's existing pattern (there is an
analogous `with-tiktok-modular-headers` plugin doing the same for `TikTokBusinessSDK`).

**How to apply:** mirror the existing tiktok plugin — read the Podfile, insert the
`:modular_headers => true` lines after `use_expo_modules!`, register the plugin in
`app.json` `plugins`. Multiple such plugins coexist fine (each re-finds `use_expo_modules!`).
Only triggers on an EAS native rebuild (prebuild regenerates the Podfile each build).
