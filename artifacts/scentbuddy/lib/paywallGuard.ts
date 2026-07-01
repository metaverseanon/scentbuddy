// Global, module-level guard ensuring only ONE paywall screen can be on the
// navigation stack at a time.
//
// Why: on first app open, multiple triggers can fire almost simultaneously —
// the post-onboarding push in `app/_layout.tsx`, the app-start / app-foreground
// prompt in `PaywallPromptProvider`, and a milestone push. Each does a
// `router.push('/paywall')`, so two identical full-screen modals get stacked.
// Dismissing the top one reveals the second, which is left in a broken /
// frozen state (two stacked fullScreenModals of the same route). This guard
// makes any second presentation a no-op while one paywall is already open.
//
// The flag is set synchronously at request time (to block near-simultaneous
// double pushes before the screen has mounted). It is then authoritatively
// confirmed on paywall mount and cleared on unmount. A watchdog releases the
// flag if the push never results in a mounted screen, so it can never get
// permanently stuck (which would block ALL future paywalls until restart).

let paywallOpen = false;
let paywallMounted = false;

const MOUNT_WATCHDOG_MS = 6000;

export function isPaywallOpen(): boolean {
  return paywallOpen;
}

// Called by the paywall screen on mount — authoritatively confirms the guard.
export function markPaywallMounted(): void {
  paywallMounted = true;
  paywallOpen = true;
}

// Called by the paywall screen on unmount — authoritatively releases the guard.
export function markPaywallUnmounted(): void {
  paywallMounted = false;
  paywallOpen = false;
}

// Runs `push` only if no paywall is currently open. Returns true if the paywall
// was requested, false if it was suppressed because one is already showing.
export function openPaywallOnce(push: () => void): boolean {
  if (paywallOpen) return false;
  paywallOpen = true;
  try {
    push();
  } catch {
    // Push failed before any screen could mount — release the guard immediately.
    paywallOpen = false;
    return false;
  }
  // Failsafe: if the paywall screen never mounts (a silently swallowed push),
  // release the guard so paywalls aren't blocked forever. Once the screen has
  // mounted, `markPaywallUnmounted` is the sole owner of releasing the flag.
  setTimeout(() => {
    if (!paywallMounted) paywallOpen = false;
  }, MOUNT_WATCHDOG_MS);
  return true;
}
