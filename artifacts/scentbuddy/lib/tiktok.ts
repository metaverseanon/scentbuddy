import { Platform } from 'react-native';

const TIKTOK_TT_APP_ID = process.env.EXPO_PUBLIC_TIKTOK_APP_ID ?? '7630509545810411528';
const TIKTOK_ACCESS_TOKEN = process.env.EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN ?? '';
const TIKTOK_IOS_APP_ID = '6761390616';
const TIKTOK_ANDROID_APP_ID = 'app.rork.0kxdwz3d5g57j5m9vjhxs';

let TikTokBusiness: typeof import('react-native-tiktok-business-sdk').default | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

function loadSdk() {
  if (TikTokBusiness) return TikTokBusiness;
  if (Platform.OS === 'web') return null;
  try {
    const mod = require('react-native-tiktok-business-sdk');
    TikTokBusiness = (mod.default ?? mod) as typeof import('react-native-tiktok-business-sdk').default;
    return TikTokBusiness;
  } catch (e) {
    console.log('[TikTok] SDK module not available:', e);
    return null;
  }
}

export function initTikTok(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (initPromise) return initPromise;
  if (!TIKTOK_ACCESS_TOKEN) {
    console.log('[TikTok] Missing EXPO_PUBLIC_TIKTOK_ACCESS_TOKEN, skipping init');
    return Promise.resolve();
  }

  initPromise = (async () => {
    const sdk = loadSdk();
    if (!sdk) return;
    try {
      const appId = Platform.OS === 'ios' ? TIKTOK_IOS_APP_ID : TIKTOK_ANDROID_APP_ID;
      const result = await sdk.initializeSdk(appId, TIKTOK_TT_APP_ID, TIKTOK_ACCESS_TOKEN, false);
      initialized = true;
      console.log('[TikTok] Init success:', result);
    } catch (e) {
      console.log('[TikTok] Init error:', e);
    }
  })();

  return initPromise;
}

async function ensureInit(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!initialized) await initTikTok();
  return initialized;
}

function withSdk(fn: (sdk: NonNullable<typeof TikTokBusiness>) => Promise<unknown>, label: string): void {
  void (async () => {
    const ok = await ensureInit();
    if (!ok) return;
    const sdk = loadSdk();
    if (!sdk) return;
    try {
      await fn(sdk);
      console.log('[TikTok] OK:', label);
    } catch (e) {
      console.log('[TikTok] Error:', label, e);
    }
  })();
}

function identifyUser(userId: string, email?: string): void {
  withSdk(
    (sdk) => sdk.identify(userId, userId, '', email ?? ''),
    `identify ${userId}`
  );
}

export const TikTokEvents = {
  login: (userId: string, email?: string) => {
    identifyUser(userId, email);
    withSdk(
      (sdk) =>
        sdk.trackEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Login' as any
        ),
      'Login'
    );
  },
  registration: (userId: string, email?: string) => {
    identifyUser(userId, email);
    withSdk(
      (sdk) =>
        sdk.trackEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Registration' as any
        ),
      'Registration'
    );
  },
  startTrial: (_userId: string, value: number, currency: string, _productId: string) => {
    withSdk(
      (sdk) =>
        sdk.trackEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'StartTrial' as any,
          undefined,
          { value, currency } as any
        ),
      'StartTrial'
    );
  },
  subscribe: (_userId: string, value: number, currency: string, _productId: string) => {
    withSdk(
      (sdk) =>
        sdk.trackEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'Subscribe' as any,
          undefined,
          { value, currency } as any
        ),
      'Subscribe'
    );
  },
  purchase: (_userId: string, value: number, currency: string, productId: string) => {
    withSdk(
      (sdk) =>
        sdk.trackContentEvent(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          'PURCHASE' as any,
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            VALUE: value as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            CURRENCY: currency as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            CONTENT_ID: productId as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            CONTENT_TYPE: 'product' as any,
          }
        ),
      'Purchase'
    );
  },
};
