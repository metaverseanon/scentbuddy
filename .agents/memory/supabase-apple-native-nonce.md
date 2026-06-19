---
name: Supabase Apple native sign-in nonce binding
description: Native "Sign in with Apple" + supabase.auth.signInWithIdToken requires a hashed/raw nonce pair, or the flow is replay-vulnerable.
---

# Supabase native Apple Sign-In needs nonce binding

When exchanging Apple's `identityToken` for a Supabase session via
`supabase.auth.signInWithIdToken({ provider: 'apple', ... })` in a native
(Expo `expo-apple-authentication`) flow, you MUST bind a nonce:

1. Generate a random **raw** nonce.
2. Pass the **SHA-256 hash** of it (use `expo-crypto` `digestStringAsync`) as the
   `nonce` option to `AppleAuthentication.signInAsync({ nonce: hashedNonce, ... })`.
   Apple echoes that hashed value into the token's `nonce` claim.
3. Pass the **raw** nonce to Supabase: `signInWithIdToken({ ..., nonce: rawNonce })`.
   Supabase re-hashes the raw nonce and compares to the token claim.

**Why:** Without nonce binding the ID-token exchange is vulnerable to token
replay/substitution. The Supabase RN example often omits it, but it is a real
auth-integrity control flagged in review. The hash goes to Apple; the raw goes to
Supabase — getting this backwards makes verification fail.

**How to apply:** Any time you add native Apple (or Google native) ID-token
sign-in on top of Supabase. Requires `expo-crypto` as a direct dep and an EAS
rebuild (new native module + `ios.usesAppleSignIn: true` entitlement; not a
JS-only EAS Update). Apple also returns name/email only on the FIRST
authorization — provision the profile on first sign-in, and never re-provision an
existing user (upsert would overwrite username/referral_code/is_pro).
