import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PostHogProvider } from "posthog-react-native";
import { getPostHog } from "@/lib/posthog";
import { AuthProvider } from "@/providers/AuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { RevenueCatProvider } from "@/providers/RevenueCatProvider";
import { PaywallPromptProvider } from "@/providers/PaywallPromptProvider";
import { MilestoneProvider, MilestoneCelebrationHost } from "@/providers/MilestoneProvider";
import OnboardingScreen from "@/app/onboarding";
import AnimatedSplash from "@/components/AnimatedSplash";
import WhatsNewModal from "@/components/WhatsNewModal";
import { initAppsFlyer } from "@/lib/appsflyer";
import { initTikTok } from "@/lib/tiktok";
import { initMeta } from "@/lib/meta";
import { useCaptureReferralLink } from "@/lib/referralLink";


const ONBOARDING_KEY = 'scentbuddy_onboarding_done';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [justOnboarded, setJustOnboarded] = useState(false);
  const router = useRouter();
  const navState = useRootNavigationState();

  useCaptureReferralLink();

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        console.log('Onboarding check result:', done);
        if (done !== 'true') {
          setNeedsOnboarding(true);
          console.log('User needs onboarding');
        } else {
          console.log('User already completed onboarding');
        }
      } catch (e) {
        console.log('Failed to check onboarding:', e);
        setNeedsOnboarding(true);
      }
      setOnboardingChecked(true);
      await SplashScreen.hideAsync();
    };
    void checkOnboarding();
    void initMeta();
    void initAppsFlyer();
    void initTikTok();
  }, []);

  const handleSplashFinish = useCallback(() => {
    console.log('Splash animation finished');
    setShowSplash(false);
  }, []);

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      console.log('Onboarding completed, saved to storage');
    } catch (e) {
      console.log('Failed to save onboarding state:', e);
    }
    setNeedsOnboarding(false);
    setJustOnboarded(true);
  }, []);

  // Open the paywall once the main Stack has actually mounted after onboarding.
  // Gate on useRootNavigationState().key so the push cannot fire before the
  // navigator is ready (otherwise router.push throws, is swallowed, and the
  // paywall is never shown). This replaces a fragile fixed-delay push.
  useEffect(() => {
    if (!justOnboarded || needsOnboarding || showSplash) return;
    if (!navState?.key) return;
    const id = setTimeout(() => {
      try {
        router.push({ pathname: '/paywall', params: { source: 'onboarding' } });
      } catch (e) {
        console.log('Failed to open paywall after onboarding:', e);
      }
      setJustOnboarded(false);
    }, 0);
    return () => clearTimeout(id);
  }, [justOnboarded, needsOnboarding, showSplash, navState?.key, router]);

  if (!onboardingChecked) {
    return null;
  }

  if (needsOnboarding) {
    return (
      <>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
        {showSplash && <AnimatedSplash onFinish={handleSplashFinish} />}
      </>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="statistics" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="fragrance-dna" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="diary" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="compare" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="scanner" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="user-profile" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="goals" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="referrals" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="pro-overview" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="twin-finder" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="blind-test" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="monthly-wrapped" options={{ headerShown: false, presentation: "card" }} />
      </Stack>
      {!showSplash && <WhatsNewModal />}
      {!showSplash && <MilestoneCelebrationHost />}
      {showSplash && <AnimatedSplash onFinish={handleSplashFinish} />}
    </>
  );
}

// Wraps the app in PostHog for product analytics + autocapture. When no key is
// configured (or on web) it renders children directly, so the app still works.
function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const client = useMemo(() => getPostHog(), []);
  if (!client) return <>{children}</>;
  return (
    <PostHogProvider client={client} autocapture>
      {children}
    </PostHogProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AnalyticsProvider>
        <ThemeProvider>
          <AuthProvider>
            <RevenueCatProvider>
              <NotificationProvider>
                <PaywallPromptProvider>
                  <MilestoneProvider>
                    <RootLayoutNav />
                  </MilestoneProvider>
                </PaywallPromptProvider>
              </NotificationProvider>
            </RevenueCatProvider>
          </AuthProvider>
        </ThemeProvider>
        </AnalyticsProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
