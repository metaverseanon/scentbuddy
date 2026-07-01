import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import createContextHook from '@nkzw/create-context-hook';
import { useRevenueCat } from '@/providers/RevenueCatProvider';
import { useAuth } from '@/providers/AuthProvider';
import { logAnalyticsEvent } from '@/lib/analytics';
import { openPaywallOnce } from '@/lib/paywallGuard';
import MilestoneCelebration from '@/components/MilestoneCelebration';

export const COLLECTION_MILESTONE = 5;
export const STREAK_MILESTONE = 7;
export const DNA_MIN_ITEMS = 3;

const SEEN_PREFIX = 'milestone_seen_';

type MilestoneKey = 'collection_5' | 'streak_7' | 'dna_complete';

type MilestoneSignals = {
  collectionCount?: number;
  streak?: number;
  dnaItemCount?: number;
};

type MilestoneConfig = {
  title: string;
  body: string;
  source: string;
  cta: string;
};

const MILESTONE_CONFIG: Record<MilestoneKey, MilestoneConfig> = {
  collection_5: {
    title: 'Your collection is taking shape',
    body: "You're building a real collection. Go Pro to track unlimited bottles and get picks matched to your taste.",
    source: 'milestone_collection',
    cta: 'See Pro',
  },
  streak_7: {
    title: 'Your streak is going strong',
    body: "You've built a steady wear-logging habit. Go Pro for unlimited streaks, goals, and deeper wear analytics.",
    source: 'milestone_streak',
    cta: 'See Pro',
  },
  dna_complete: {
    title: 'Your Fragrance DNA is ready',
    body: 'Your scent profile is built from your collection. Go Pro to unlock your full breakdown — longevity, versatility, and seasonal fit.',
    source: 'milestone_dna',
    cta: 'See Pro',
  },
};

export const [MilestoneProvider, useMilestones] = createContextHook(() => {
  const router = useRouter();
  const { isPro, rcConfigured, customerInfo } = useRevenueCat();
  const { session } = useAuth();

  // Only trust Pro status once RevenueCat is configured AND customer info has
  // actually loaded (a non-null CustomerInfo). Before that, isPro is its default
  // `false`, so firing would risk showing a celebration to a real Pro user.
  const ready = rcConfigured && customerInfo != null;

  const isProRef = useRef(isPro);
  useEffect(() => {
    isProRef.current = isPro;
  }, [isPro]);

  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [active, setActive] = useState<MilestoneKey | null>(null);
  const activeRef = useRef<MilestoneKey | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const shownRef = useRef<Set<MilestoneKey>>(new Set());
  const processingRef = useRef<Set<MilestoneKey>>(new Set());
  // Synchronous lock so only ONE milestone is shown/claimed at a time, even if
  // several signals are eligible within the same evaluation tick. It stays held
  // while a celebration is visible and is released on continue/dismiss.
  const claimingRef = useRef(false);
  const lastSignalsRef = useRef<MilestoneSignals>({});

  const fire = useCallback(async (key: MilestoneKey) => {
    if (!readyRef.current) return;
    if (isProRef.current) return;
    if (!sessionRef.current) return;
    if (shownRef.current.has(key)) return;
    if (processingRef.current.has(key)) return;
    if (activeRef.current) return;
    if (claimingRef.current) return;

    // Claim synchronously, before any await, so a parallel fire() in the same
    // tick cannot also pass the guards above.
    claimingRef.current = true;
    processingRef.current.add(key);
    let activated = false;
    try {
      const seen = await AsyncStorage.getItem(SEEN_PREFIX + key);
      if (seen) {
        shownRef.current.add(key);
        return;
      }
      // Re-check after the async hop: the storage read yields to the event loop,
      // which lets React flush any pending Pro-status update so isProRef is current.
      if (isProRef.current || activeRef.current) return;
      await AsyncStorage.setItem(SEEN_PREFIX + key, '1');
      shownRef.current.add(key);
      void logAnalyticsEvent('milestone_celebration_shown', { milestone: key });
      activated = true;
      setActive(key);
    } catch (e) {
      console.log('[milestone] fire error', key, e);
    } finally {
      processingRef.current.delete(key);
      // Keep the lock held while the celebration is on screen; release it only
      // if we did not actually show anything.
      if (!activated) claimingRef.current = false;
    }
  }, []);

  const evaluate = useCallback(() => {
    const s = lastSignalsRef.current;
    if (s.collectionCount != null && s.collectionCount >= COLLECTION_MILESTONE) void fire('collection_5');
    if (s.streak != null && s.streak >= STREAK_MILESTONE) void fire('streak_7');
    if (s.dnaItemCount != null && s.dnaItemCount >= DNA_MIN_ITEMS) void fire('dna_complete');
  }, [fire]);

  const checkMilestone = useCallback(
    (signals: MilestoneSignals) => {
      lastSignalsRef.current = { ...lastSignalsRef.current, ...signals };
      evaluate();
    },
    [evaluate],
  );

  // Re-evaluate the last reported signals once Pro status resolves, so a
  // milestone reported during the load window still fires for non-Pro users.
  useEffect(() => {
    if (ready && !isPro) evaluate();
  }, [ready, isPro, evaluate]);

  const handleContinue = useCallback(() => {
    const a = activeRef.current;
    setActive(null);
    claimingRef.current = false;
    if (!a) return;
    const cfg = MILESTONE_CONFIG[a];
    void logAnalyticsEvent('milestone_celebration_continue', { milestone: a, source: cfg.source });
    openPaywallOnce(() => router.push({ pathname: '/paywall', params: { source: cfg.source } }));
  }, [router]);

  const handleDismiss = useCallback(() => {
    const a = activeRef.current;
    setActive(null);
    claimingRef.current = false;
    if (!a) return;
    void logAnalyticsEvent('milestone_celebration_dismissed', { milestone: a });
  }, []);

  return useMemo(
    () => ({
      checkMilestone,
      active,
      handleContinue,
      handleDismiss,
    }),
    [checkMilestone, active, handleContinue, handleDismiss],
  );
});

export function MilestoneCelebrationHost() {
  const { active, handleContinue, handleDismiss } = useMilestones();
  const cfg = active ? MILESTONE_CONFIG[active] : null;
  return (
    <MilestoneCelebration
      visible={!!cfg}
      title={cfg?.title ?? ''}
      body={cfg?.body ?? ''}
      ctaLabel={cfg?.cta ?? ''}
      onContinue={handleContinue}
      onDismiss={handleDismiss}
    />
  );
}
