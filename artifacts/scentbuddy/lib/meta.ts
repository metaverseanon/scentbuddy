import { Platform } from 'react-native';

// Meta (Facebook) App ID. The App ID + Client Token are baked into the native
// build by the react-native-fbsdk-next config plugin (Info.plist on iOS,
// strings.xml on Android); this constant is only a runtime convenience/fallback.
const META_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '1738053333886237';

type FBSDK = typeof import('react-native-fbsdk-next');

let fbsdk: FBSDK | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
// Whether the user authorized App Tracking Transparency. Gates IDFA-based
// tracking and any PII (advanced matching) we send to Meta.
let trackingGranted = false;

function loadSdk(): FBSDK | null {
  if (fbsdk) return fbsdk;
  if (Platform.OS === 'web') return null;
  try {
    // Lazy require so the web bundle never tries to load the native module.
    fbsdk = require('react-native-fbsdk-next') as FBSDK;
    return fbsdk;
  } catch (e) {
    console.log('[Meta] SDK module not available:', e);
    return null;
  }
}

// iOS 14.5+ App Tracking Transparency. Returns whether the user granted access
// to the IDFA. On Android (and web) there is no ATT prompt, so we treat tracking
// as allowed. The same prompt also unlocks the IDFA for AppsFlyer/TikTok.
async function requestTrackingConsent(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  try {
    const att = require('expo-tracking-transparency') as typeof import('expo-tracking-transparency');
    let { status } = await att.getTrackingPermissionsAsync();
    if (status === 'undetermined') {
      ({ status } = await att.requestTrackingPermissionsAsync());
    }
    return status === 'granted';
  } catch (e) {
    console.log('[Meta] ATT request failed:', e);
    return false;
  }
}

export function initMeta(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const sdk = loadSdk();
    if (!sdk) return;
    try {
      const { Settings } = sdk;
      Settings.setAppID(META_APP_ID);
      Settings.setAdvertiserIDCollectionEnabled(true);
      Settings.setAutoLogAppEventsEnabled(true);

      // iOS 14.5+: ask for ATT consent FIRST, then gate advertiser tracking
      // (IDFA) and SKAdNetwork conversion-value reporting on the user's choice.
      // Native auto-init is disabled (app.json: isAutoInitEnabled=false) so the
      // SDK is only initialized here, after consent is resolved.
      trackingGranted = await requestTrackingConsent();
      await Settings.setAdvertiserTrackingEnabled(trackingGranted);

      Settings.initializeSDK();
      initialized = true;
      console.log('[Meta] Init success (ATT granted:', trackingGranted, ')');
    } catch (e) {
      console.log('[Meta] Init error:', e);
    }
  })();

  return initPromise;
}

async function ensureInit(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!initialized) await initMeta();
  return initialized;
}

function withLogger(
  fn: (logger: FBSDK['AppEventsLogger']) => void,
  label: string
): void {
  void (async () => {
    const ok = await ensureInit();
    if (!ok) return;
    const sdk = loadSdk();
    if (!sdk) return;
    try {
      fn(sdk.AppEventsLogger);
      console.log('[Meta] OK:', label);
    } catch (e) {
      console.log('[Meta] Error:', label, e);
    }
  })();
}

export const MetaEvents = {
  login: (userId: string, email?: string) => {
    withLogger((logger) => {
      logger.setUserID(userId);
      // Advanced matching (PII) only when the user consented to tracking.
      if (email && trackingGranted) logger.setUserData({ email });
      logger.logEvent('Login');
    }, 'Login');
  },
  registration: (userId: string, email?: string) => {
    withLogger((logger) => {
      logger.setUserID(userId);
      if (email && trackingGranted) logger.setUserData({ email });
      logger.logEvent(logger.AppEvents.CompletedRegistration, {
        [logger.AppEventParams.RegistrationMethod]: 'email',
      });
    }, 'Registration');
  },
  startTrial: (_userId: string, value: number, currency: string, productId: string) => {
    withLogger((logger) => {
      logger.logEvent(logger.AppEvents.StartTrial, value, {
        [logger.AppEventParams.Currency]: currency,
        [logger.AppEventParams.ContentID]: productId,
        [logger.AppEventParams.ContentType]: 'product',
      });
    }, 'StartTrial');
  },
  subscribe: (_userId: string, value: number, currency: string, productId: string) => {
    withLogger((logger) => {
      logger.logEvent(logger.AppEvents.Subscribe, value, {
        [logger.AppEventParams.Currency]: currency,
        [logger.AppEventParams.ContentID]: productId,
        [logger.AppEventParams.ContentType]: 'product',
      });
    }, 'Subscribe');
  },
  purchase: (_userId: string, value: number, currency: string, productId: string) => {
    withLogger((logger) => {
      logger.logPurchase(value, currency, {
        [logger.AppEventParams.ContentID]: productId,
        [logger.AppEventParams.ContentType]: 'product',
      });
    }, 'Purchase');
  },
};
