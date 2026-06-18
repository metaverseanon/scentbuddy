import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { captureEvent, identifyUser } from './posthog';

const ANON_ID_KEY = 'scentbuddy_anon_id';

let cachedAnonId: string | null = null;

function generateAnonId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

async function getAnonId(): Promise<string> {
  if (cachedAnonId) return cachedAnonId;
  try {
    let id = await AsyncStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = generateAnonId();
      await AsyncStorage.setItem(ANON_ID_KEY, id);
    }
    cachedAnonId = id;
    return id;
  } catch {
    return 'unknown';
  }
}

export async function logAnalyticsEvent(
  event: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  try {
    const anonId = await getAnonId();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? null;

    if (userId) identifyUser(userId);
    captureEvent(event, props);

    await supabase.from('analytics_events').insert({
      user_id: userId,
      anon_id: anonId,
      event,
      props,
    });
  } catch (e) {
    console.log('[analytics] failed to log event', event, e);
  }
}
