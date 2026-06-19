---
name: EAS build/submit from Replit
description: How to trigger EAS Build + Submit (TestFlight/Play) for the Expo app from the Replit main agent
---

# Triggering EAS Build / Submit from Replit

Run `eas` from the Expo artifact dir (`artifacts/scentbuddy`, where `eas.json` + `app.json` live). `eas` is installed globally.

## Must set EAS_NO_VCS=1
The main agent blocks destructive git operations, so `eas build` fails with
`Destructive git operations are not allowed ... .git/index.lock` because EAS uses git to archive the project.
**Fix:** prefix with `EAS_NO_VCS=1`, which makes EAS tar the working directory (respecting .gitignore/.easignore) instead of using git.

**Why:** EAS's default VCS archiver writes to `.git`; that write is sandbox-blocked here.
**How to apply:** any `eas build` (and anything that archives the project) from the main agent → `EAS_NO_VCS=1 eas build ...`.

## Non-interactive flags
The bash runner can't answer prompts, so always pass `--non-interactive`. Use `--no-wait` so the call returns after the build is queued (EAS builds take ~20-40 min; far longer than the 2-min command cap). Monitor with `eas build:view <id>` / `eas build:list`.

## Login
Interactive `eas login` (password/2FA) must be done by the user in the **Shell tab** — the agent bash can't type into prompts. The session persists in `~/.expo/state.json`, which the agent's bash shares (same container/home), so after the user logs in the agent can run `eas whoami` and proceed.

## TestFlight (iOS) one-shot
`EAS_NO_VCS=1 eas build --platform ios --profile production --auto-submit --non-interactive --no-wait`
- `production` profile: store distribution, `autoIncrement` build number, channel `production`.
- `--auto-submit` queues the App Store Connect submission server-side after the build (uses `submit.production.ios.ascAppId` in eas.json).
- Apple signing creds (dist cert + provisioning profile) and the ASC API key are stored on EAS servers for this project, so build+submit run fully non-interactively — no Apple login needed.

## `eas update` (OTA / EAS Update) — run it from the Shell, not the agent
Unlike `eas build` (bundling is offloaded to EAS servers), `eas update` runs the
Metro export **locally on this container**. From the agent bash it fails
silently: the process dies after ~100s having written only the EAS_NO_VCS
warning to the log, and no new update appears in `eas update:list` — almost
certainly an OOM/time limit during the local bundle, with output buffered/lost
because there's no TTY. Foreground attempts just hit the 2-min command cap mid-bundle.
**Fix:** have the user run it in the **Shell tab** (real TTY, shows bundle progress):
`cd artifacts/scentbuddy && EAS_NO_VCS=1 eas update --branch production --message "..."`.
**Why:** JS-only changes (new screens/UI, logic) reach already-installed builds
ONLY via a published EAS Update on the matching channel→branch + runtimeVersion
(`appVersion` policy → app.json `version`, currently 1.3.3). Reinstalling the same
build or running a SQL migration does nothing for client JS.
**How to apply:** after any JS-only feature, the device won't show it until an
update is published to its branch (`production`) at its runtime version. On the
device, OTA applies on the SECOND cold start (first launch downloads in
background, next cold start swaps it in) — tell users to fully close & reopen twice.

## Exception: adding a NEW capability/entitlement breaks non-interactive builds
When you add a new entitlement (e.g. `usesAppleSignIn: true` → `com.apple.developer.applesignin`), the
**existing provisioning profile on EAS is stale** and the Xcode build fails at "Run fastlane" with
`provisioning profile ... doesn't support the Sign in with Apple capability / doesn't include the
... entitlement`. A `--non-interactive` build just reuses the stale profile and cannot fix it.
**Fix (user must do it in the Shell — needs Apple ID + 2FA):** run an INTERACTIVE build
`EAS_NO_VCS=1 eas build --platform ios --profile production --auto-submit` (NO `--non-interactive`),
log into Apple when prompted; EAS then syncs the capability on the App ID and regenerates the
provisioning profile with the new entitlement before building. Same applies to any new native
capability (push, associated domains, etc.).
