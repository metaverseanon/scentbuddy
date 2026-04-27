import { Platform } from 'react-native';
import appsFlyer from 'react-native-appsflyer';

const APPSFLYER_DEV_KEY = process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY ?? '';
const APPSFLYER_IOS_APP_ID = '6761390616';

let initialized = false;
let initPromise: Promise<void> | null = null;

export function initAppsFlyer(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (initPromise) return initPromise;
  if (!APPSFLYER_DEV_KEY) {
    console.log('[AppsFlyer] Missing EXPO_PUBLIC_APPSFLYER_DEV_KEY, skipping init');
    return Promise.resolve();
  }

  initPromise = new Promise((resolve) => {
    appsFlyer.initSdk(
      {
        devKey: APPSFLYER_DEV_KEY,
        appId: APPSFLYER_IOS_APP_ID,
        isDebug: false,
        onInstallConversionDataListener: false,
        onDeepLinkListener: false,
        timeToWaitForATTUserAuthorization: 10,
      },
      (result) => {
        initialized = true;
        console.log('[AppsFlyer] Init success:', result);
        resolve();
      },
      (error) => {
        console.log('[AppsFlyer] Init error:', error);
        resolve();
      }
    );
  });

  return initPromise;
}

function logEvent(eventName: string, eventValues: Record<string, unknown> = {}): void {
  if (Platform.OS === 'web') return;
  if (!initialized) {
    console.log('[AppsFlyer] Not initialized yet, queueing event:', eventName);
    void initAppsFlyer().then(() => {
      appsFlyer.logEvent(
        eventName,
        eventValues,
        () => console.log('[AppsFlyer] Event logged (after init):', eventName),
        (err) => console.log('[AppsFlyer] Event error:', eventName, err)
      );
    });
    return;
  }
  appsFlyer.logEvent(
    eventName,
    eventValues,
    () => console.log('[AppsFlyer] Event logged:', eventName),
    (err) => console.log('[AppsFlyer] Event error:', eventName, err)
  );
}

export function setAppsFlyerUserId(userId: string): void {
  if (Platform.OS === 'web') return;
  appsFlyer.setCustomerUserId(userId, (res) => {
    console.log('[AppsFlyer] CustomerUserId set:', res);
  });
}

export const AppsFlyerEvents = {
  login: (userId: string, email?: string) => {
    setAppsFlyerUserId(userId);
    logEvent('af_login', { af_user_id: userId, email });
  },
  registration: (userId: string, email?: string) => {
    setAppsFlyerUserId(userId);
    logEvent('af_complete_registration', {
      af_user_id: userId,
      email,
      af_registration_method: 'email',
    });
  },
  startTrial: (userId: string, value: number, currency: string, productId: string) => {
    logEvent('af_start_trial', {
      af_revenue: value,
      af_currency: currency,
      af_content_id: productId,
      af_content_type: 'product',
    });
  },
  subscribe: (userId: string, value: number, currency: string, productId: string) => {
    logEvent('af_subscribe', {
      af_revenue: value,
      af_currency: currency,
      af_content_id: productId,
      af_content_type: 'product',
    });
  },
  purchase: (userId: string, value: number, currency: string, productId: string) => {
    logEvent('af_purchase', {
      af_revenue: value,
      af_currency: currency,
      af_content_id: productId,
      af_content_type: 'product',
    });
  },
};
