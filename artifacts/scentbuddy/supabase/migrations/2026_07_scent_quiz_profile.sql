-- Persist each user's onboarding scent quiz as structured JSON on their profile.
--
-- The redesigned onboarding quiz (constants/quiz.ts -> QuizResults) collects far
-- more per-user signal than the original 4 fields — experience level, collection
-- size, struggles, discovery style, intensity, personality, seasons, goals,
-- budget, adventurousness, signature status, gender, etc. The whole QuizResults
-- object is written to profiles.scent_quiz so a future per-user "smart picks"
-- recommendation algorithm can read one row and tailor suggestions to that
-- specific user's taste.
--
-- JSONB (not promoted columns) is intentional: suggestions are computed per user
-- from a single profile row, so a schema-less blob keeps the quiz free to evolve
-- without a migration each time a question is added.
--
-- Idempotent + additive: safe to re-run, existing rows are untouched (scent_quiz
-- stays NULL until the user completes/retakes the quiz). Paste into the Supabase
-- SQL editor.

alter table public.profiles
  add column if not exists scent_quiz jsonb;

-- Force PostgREST to refresh its schema cache so the new column is immediately
-- visible to the app (avoids "Could not find the 'scent_quiz' column ... in the
-- schema cache" errors right after applying this migration).
notify pgrst, 'reload schema';
