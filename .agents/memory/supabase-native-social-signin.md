---
name: Supabase native social sign-in (Apple + Google)
description: How native Apple/Google sign-in is wired into Supabase in this Expo app, and what differs between them.
---

# Native social sign-in on Supabase (this app)

Both Apple and Google use `supabase.auth.signInWithIdToken({ provider, token })`
with a native token, then share one `provisionNewUser()` helper: first-time users
get a profile + generated unique username; returning users (or any profiles
lookup error) skip provisioning and only fire login analytics. Never re-provision
an existing user — the upsert would reset username/referral_code/is_pro.

Key differences:
- **Apple** (`expo-apple-authentication`) REQUIRES nonce binding (SHA-256 hash to
  Apple, raw nonce to Supabase via `expo-crypto`). Apple returns name/email only
  on the FIRST authorization. iOS-only button; `ios.usesAppleSignIn: true`.
- **Google** (`@react-native-google-signin/google-signin`) does NOT need a nonce.
  Returns name/email every sign-in. Needs a Web client ID (`webClientId`, token
  audience) + iOS client ID; the *reversed* iOS client ID goes in `app.json` as
  the plugin `iosUrlScheme`. Map cancellation via typed `statusCodes` +
  `isSuccessResponse` to a synthesized `ERR_REQUEST_CANCELED` the UI swallows.

**Why:** these are the non-obvious provider-specific gotchas (nonce only for
Apple, reversed-client-id URL scheme only for Google, first-vs-every-time
name/email).

**How to apply:** any new native ID-token provider here — reuse provisionNewUser,
add a native rebuild step (new native module = NOT a JS-only EAS Update), and add
the provider's client IDs to the Supabase dashboard's authorized Client IDs.
