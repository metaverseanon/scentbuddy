import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Session } from '@supabase/supabase-js';
import createContextHook from '@nkzw/create-context-hook';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { ONBOARDING_QUIZ_KEY, QuizResults, STARTER_COLLECTION_KEY, StarterPick } from '@/constants/quiz';
import { generateReferralCode, consumePendingReferral } from '@/lib/referrals';
import { setPendingReferralCode } from '@/lib/referralLink';
import { AppsFlyerEvents } from '@/lib/appsflyer';
import { TikTokEvents } from '@/lib/tiktok';
import { MetaEvents } from '@/lib/meta';
import { resetPostHog } from '@/lib/posthog';

// Provision a brand-new user's profile + onboarding side effects. Shared by the
// email/password sign-up flow and the "Sign in with Apple" first-time flow so
// both create the same profile shape, sync the onboarding quiz + starter
// collection, fire registration analytics, and attribute any pending referral.
async function provisionNewUser(params: {
  userId: string;
  email: string;
  username: string;
  displayName: string;
}): Promise<void> {
  const { userId, email, username, displayName } = params;

  let quizResults: QuizResults | null = null;
  try {
    const stored = await AsyncStorage.getItem(ONBOARDING_QUIZ_KEY);
    if (stored) {
      quizResults = JSON.parse(stored) as QuizResults;
      console.log('Found onboarding quiz results for new user:', quizResults);
    }
  } catch (e) {
    console.log('Failed to read quiz results:', e);
  }

  const newReferralCode = generateReferralCode(username, userId);

  const profileData: Record<string, unknown> = {
    id: userId,
    email,
    username,
    display_name: displayName || username,
    avatar_emoji: '🧴',
    is_pro: false,
    referral_code: newReferralCode,
    created_at: new Date().toISOString(),
  };

  if (quizResults) {
    profileData.favorite_note = quizResults.favoriteNotes?.[0] ?? null;
    profileData.scent_quiz = quizResults;
  }

  const { error: upsertError } = await supabase.from('profiles').upsert(profileData);
  if (upsertError) {
    console.log('[Auth] Profile upsert failed (likely RLS pre-confirmation), trigger should have set basics:', upsertError.message);
  }

  if (quizResults) {
    try {
      await AsyncStorage.removeItem(ONBOARDING_QUIZ_KEY);
      console.log('Cleared onboarding quiz data after account creation');
    } catch (e) {
      console.log('Failed to clear quiz data:', e);
    }
  }

  try {
    const starterRaw = await AsyncStorage.getItem(STARTER_COLLECTION_KEY);
    if (starterRaw) {
      const picks = JSON.parse(starterRaw) as StarterPick[];
      if (Array.isArray(picks) && picks.length > 0) {
        const rows = picks
          .filter(p => p && p.name)
          .map(p => ({
            user_id: userId,
            perfume_name: p.name,
            perfume_brand: p.brand ?? '',
            concentration: p.concentration ?? null,
            top_notes: p.topNotes ?? [],
            heart_notes: p.heartNotes ?? [],
            base_notes: p.baseNotes ?? [],
            image_url: p.imageUrl ?? null,
            is_favorite: false,
            date_added: new Date().toISOString(),
            status: 'owned',
            fill_level: 100,
          }));
        if (rows.length > 0) {
          const { error: starterError } = await supabase.from('user_collections').insert(rows);
          if (starterError) {
            console.log('[Auth] Starter collection insert failed, keeping picks for retry:', starterError.message);
          } else {
            console.log('[Auth] Synced starter collection:', rows.length);
            await AsyncStorage.removeItem(STARTER_COLLECTION_KEY);
          }
        } else {
          await AsyncStorage.removeItem(STARTER_COLLECTION_KEY);
        }
      } else {
        await AsyncStorage.removeItem(STARTER_COLLECTION_KEY);
      }
    }
  } catch (e) {
    console.log('Failed to sync starter collection:', e);
  }

  void AppsFlyerEvents.registration(userId, email);
  void TikTokEvents.registration(userId, email);
  MetaEvents.registration(userId, email);

  // Attribute the referral now that the profile row exists and (usually) a
  // session is active. Attribution is server-side: referred_id comes from the
  // JWT, never the body. If there's no session yet, this no-ops and the consume
  // effect retries after sign-in.
  await consumePendingReferral();
}

// Apple only returns the user's name/email on the FIRST sign-in, so new Apple
// users need an auto-generated unique username. Best-effort uniqueness check.
function sanitizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 12);
}

async function generateUniqueUsername(seed: string): Promise<string> {
  const base = sanitizeUsername(seed) || 'scent';
  for (let i = 0; i < 5; i++) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base}_${suffix}`;
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `scent_${Date.now().toString(36)}`;
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        queryClient.clear();
        resetPostHog();
      }
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  // Once authenticated, attribute any pending referral code (from a deep link or
  // the sign-up form) to its referrer via the secure Edge Function. referred_id
  // is derived server-side from the JWT, so it can't be forged.
  useEffect(() => {
    if (session?.user?.id) {
      void consumePendingReferral();
    }
  }, [session?.user?.id]);

  const profileQuery = useQuery({
    queryKey: ['profile', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      if (error) {
        console.log('Profile fetch error:', error);
        return null;
      }
      return data as Profile;
    },
    enabled: !!session?.user?.id,
  });

  const signInMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        void AppsFlyerEvents.login(data.user.id, data.user.email ?? email);
        void TikTokEvents.login(data.user.id, data.user.email ?? email);
        MetaEvents.login(data.user.id, data.user.email ?? email);
      }
      return data;
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async ({ email, password, username, displayName, referralCode }: { email: string; password: string; username: string; displayName: string; referralCode?: string }) => {
      // Store the referral code BEFORE auth state changes so neither the
      // consumePendingReferral effect nor the explicit consume below can miss it.
      if (referralCode?.trim()) {
        await setPendingReferralCode(referralCode);
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName || username,
          },
        },
      });
      if (error) throw error;
      if (data.user) {
        await provisionNewUser({
          userId: data.user.id,
          email,
          username,
          displayName,
        });
      }
      return data;
    },
  });

  // "Sign in with Apple" (native iOS). Exchanges Apple's identity token for a
  // Supabase session via signInWithIdToken, then provisions a profile the first
  // time (Apple only returns name/email on the first authorization).
  const signInWithAppleMutation = useMutation({
    mutationFn: async () => {
      const AppleAuthentication = await import('expo-apple-authentication');
      const Crypto = await import('expo-crypto');

      // Nonce binding (replay protection): send the SHA-256 hash of a random raw
      // nonce to Apple (it lands in the token's `nonce` claim), and hand the RAW
      // nonce to Supabase, which re-hashes and compares against the claim.
      const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token. Please try again.');
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;

      const user = data.user;
      if (user) {
        const { data: existingProfile, error: lookupError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();

        // On a lookup error we deliberately do NOT provision: re-running
        // provisionNewUser would upsert over an existing profile and reset
        // username/referral_code/is_pro. Skipping is the safe failure mode — a
        // genuinely new user simply gets provisioned on their next sign-in.
        if (existingProfile || lookupError) {
          if (lookupError) {
            console.log('[Auth] Apple profile lookup failed, skipping provisioning:', lookupError.message);
          }
          void AppsFlyerEvents.login(user.id, user.email ?? '');
          void TikTokEvents.login(user.id, user.email ?? '');
          MetaEvents.login(user.id, user.email ?? '');
        } else {
          const fullName = credential.fullName;
          const displayName =
            [fullName?.givenName, fullName?.familyName].filter(Boolean).join(' ').trim() ||
            (user.email ? user.email.split('@')[0] : 'Scent Lover');
          const username = await generateUniqueUsername(
            fullName?.givenName || (user.email ? user.email.split('@')[0] : 'scent'),
          );
          await provisionNewUser({
            userId: user.id,
            email: user.email ?? '',
            username,
            displayName,
          });
        }
      }
      return data;
    },
  });

  const router = useRouter();

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    queryClient.clear();
    try {
      router.replace('/');
    } catch {
      console.log('Navigation after sign out');
    }
  }, [queryClient, router]);

  const deleteAccount = useCallback(async () => {
    if (!session?.user?.id) throw new Error('Not signed in');
    const userId = session.user.id;
    console.log('Starting account deletion for user:', userId);

    try {
      await supabase.from('user_collections').delete().eq('user_id', userId);
      console.log('Deleted user collections');
    } catch (e) {
      console.log('Error deleting collections:', e);
    }

    try {
      await supabase.from('user_wishlists').delete().eq('user_id', userId);
      console.log('Deleted user wishlists');
    } catch (e) {
      console.log('Error deleting wishlists:', e);
    }

    try {
      await supabase.from('wear_diary').delete().eq('user_id', userId);
      console.log('Deleted wear diary entries');
    } catch (e) {
      console.log('Error deleting wear diary:', e);
    }

    try {
      await supabase.from('user_goals').delete().eq('user_id', userId);
      console.log('Deleted user goals');
    } catch (e) {
      console.log('Error deleting goals:', e);
    }

    // Referral rows (user_referrals + referral_reward_grants) are removed
    // automatically via ON DELETE CASCADE when the profile is deleted below.

    try {
      await supabase.from('profiles').delete().eq('id', userId);
      console.log('Deleted user profile');
    } catch (e) {
      console.log('Error deleting profile:', e);
    }

    try {
      await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`]);
      console.log('Deleted avatar');
    } catch (e) {
      console.log('Error deleting avatar:', e);
    }

    await supabase.auth.signOut();
    setSession(null);
    queryClient.clear();
    console.log('Account deletion complete, signed out');

    try {
      router.replace('/');
    } catch {
      console.log('Navigation after account deletion');
    }
  }, [session?.user?.id, queryClient, router]);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ['profile', session.user.id] });
  }, [session?.user?.id, queryClient]);

  return useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile: profileQuery.data ?? null,
    loading,
    profileLoading: profileQuery.isLoading,
    signIn: signInMutation.mutateAsync,
    signUp: signUpMutation.mutateAsync,
    signInWithApple: signInWithAppleMutation.mutateAsync,
    signOut,
    deleteAccount,
    updateProfile,
    signInLoading: signInMutation.isPending,
    signUpLoading: signUpMutation.isPending,
    signInWithAppleLoading: signInWithAppleMutation.isPending,
    signInError: signInMutation.error?.message ?? null,
    signUpError: signUpMutation.error?.message ?? null,
    signInWithAppleError: signInWithAppleMutation.error?.message ?? null,
  }), [
    session,
    profileQuery.data,
    profileQuery.isLoading,
    loading,
    signInMutation.mutateAsync,
    signInMutation.isPending,
    signInMutation.error,
    signUpMutation.mutateAsync,
    signUpMutation.isPending,
    signUpMutation.error,
    signInWithAppleMutation.mutateAsync,
    signInWithAppleMutation.isPending,
    signInWithAppleMutation.error,
    signOut,
    deleteAccount,
    updateProfile,
  ]);
});
