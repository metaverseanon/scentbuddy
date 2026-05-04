import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://bmhrvttaqcxzczwdlftv.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtaHJ2dHRhcWN4emN6d2RsZnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTQzMDMsImV4cCI6MjA4ODE5MDMwM30.yPAsUeKbCPDWU_S2xSgvoB5_IKONd3wPuhJX1AiIwJs';

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      console.log('SecureStore setItem error for key:', key);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      console.log('SecureStore removeItem error for key:', key);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const SEARCH_BASE_URL = 'https://scentbuddy.vercel.app';

const CACHE_MAX = 100;
const searchCache = new Map<string, { ts: number; results: any[] }>();
const CACHE_TTL = 1000 * 60 * 10;

function getCached(key: string): any[] | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCache(key: string, results: any[]) {
  if (searchCache.size >= CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  searchCache.set(key, { ts: Date.now(), results });
}

export async function searchFragrances(query: string, limit: number = 15): Promise<any[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const cacheKey = `${trimmed.toLowerCase()}|${limit}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `${SEARCH_BASE_URL}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}`
    );
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    const results = data.results || [];
    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.log('Fragrance search error:', error);
    return [];
  }
}

export function forceHttps(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, 'https://');
}
