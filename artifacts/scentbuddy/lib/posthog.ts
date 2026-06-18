import { Platform } from 'react-native';
import { PostHog } from 'posthog-react-native';

// PostHog project (client) API key + host. The key is a PUBLIC client key that
// gets baked into the app bundle, so it lives in an EXPO_PUBLIC_ env var.
// Host: US cloud = https://us.i.posthog.com, EU cloud = https://eu.i.posthog.com.
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null = null;
let identifiedId: string | null = null;

// Lazily create the singleton PostHog client. Returns null on web (no native
// SDK) or when no key is configured, so all callers degrade gracefully.
export function getPostHog(): PostHog | null {
  if (Platform.OS === 'web') return null;
  if (!POSTHOG_KEY) return null;
  if (client) return client;
  try {
    client = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST });
    return client;
  } catch (e) {
    console.log('[PostHog] init failed', e);
    return null;
  }
}

export function captureEvent(event: string, props?: Record<string, unknown>): void {
  try {
    getPostHog()?.capture(event, props as Record<string, any>);
  } catch (e) {
    console.log('[PostHog] capture failed', event, e);
  }
}

// Associate subsequent events with a signed-in user. Guarded so we only emit one
// $identify per distinct id (PostHog identify calls are otherwise noisy).
export function identifyUser(id: string, props?: Record<string, unknown>): void {
  if (!id || identifiedId === id) return;
  try {
    getPostHog()?.identify(id, props as Record<string, any>);
    identifiedId = id;
  } catch (e) {
    console.log('[PostHog] identify failed', e);
  }
}

// Clear identity on sign-out so the next user isn't merged into the previous one.
export function resetPostHog(): void {
  identifiedId = null;
  try {
    getPostHog()?.reset();
  } catch (e) {
    console.log('[PostHog] reset failed', e);
  }
}
