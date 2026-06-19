---
name: Google native sign-in + Supabase nonce error
description: Why "Passed nonce and nonce in id_token should either both exist or not" happens for Google (not Apple) and the fix that fits the free tier
---

# Google native sign-in ↔ Supabase nonce mismatch

Symptom: tapping "Sign in with Google" on iOS shows Supabase error
**"Passed nonce and nonce in id_token should either both exist or not."**
(Apple sign-in is unaffected — it does full nonce binding.)

## Root cause
Supabase GoTrue, by default, enforces nonce consistency on `signInWithIdToken`:
the `nonce` claim in the Google id_token and the `nonce` you pass must either
both be present (and match after SHA-256) or both be absent. On iOS the Google
SDK / Supabase pairing trips this even though the app passes no nonce.

## Why the "secure" code fix is NOT available here
The proper fix is nonce binding (like Apple): pass `sha256(rawNonce)` to
`GoogleSignin.signIn({ nonce })` and the raw nonce to Supabase.
**But `GoogleSignin.signIn({ nonce })` is a PAID-TIER feature of
`@react-native-google-signin/google-signin`.** The free/public package
(v16.1.2 here) does NOT expose `nonce` anywhere — its TS types reject it
(`'nonce' does not exist in type 'SignInParams'`) and the native iOS `signIn`
only forwards `loginHint` + `additionalScopes` to
`GIDSignIn signInWithPresentingViewController:hint:additionalScopes:`. So you
cannot inject a matching nonce on the free tier.

## The fix we use (no code change, no native rebuild, no EAS Update)
Enable **Authentication → Providers → Google → "Skip nonce check"** in the
Supabase dashboard, then leave the client code passing NO nonce (current state).
This is a server-side toggle, so it fixes already-installed builds instantly.

**Why:** trade replay-attack protection on the Google path for it working at all
on the free tier; Apple still keeps full nonce binding.
**How to apply:** if Google sign-in regresses with this error, first check the
Supabase Google provider's "Skip nonce check" toggle is still ON — do NOT try to
add `nonce` to `GoogleSignin.signIn()` (free tier can't, and it won't typecheck).
The only way to get the secure nonce path is the paid library tier (or a custom
native module) + a native rebuild.
