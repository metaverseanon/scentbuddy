import React, { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ScentQuiz from '@/components/ScentQuiz';
import { ONBOARDING_QUIZ_KEY, QuizResults } from '@/constants/quiz';
import { useAuth } from '@/providers/AuthProvider';

export default function ScentQuizScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, updateProfile } = useAuth();
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const handleComplete = useCallback(
    async (results: QuizResults) => {
      setSaving(true);
      try {
        await AsyncStorage.setItem(ONBOARDING_QUIZ_KEY, JSON.stringify(results));
      } catch (e) {
        console.log('[scent-quiz] Failed to cache quiz results:', e);
      }
      if (user) {
        try {
          await updateProfile({
            scent_quiz: results,
            favorite_note: results.favoriteNotes?.[0] ?? null,
          });
        } catch (e) {
          console.log('[scent-quiz] Failed to persist quiz results:', e);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['quiz-results'] });
      void queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      setSaving(false);
      goBack();
    },
    [user, updateProfile, queryClient, goBack],
  );

  return (
    <ScentQuiz
      onComplete={handleComplete}
      onExit={goBack}
      submitLabel="Save my answers"
      submitting={saving}
    />
  );
}
