export const ONBOARDING_QUIZ_KEY = 'scentbuddy_onboarding_quiz';
export const STARTER_COLLECTION_KEY = 'scentbuddy_starter_collection';

export interface StarterPick {
  name: string;
  brand: string;
  concentration?: string | null;
  topNotes?: string[];
  heartNotes?: string[];
  baseNotes?: string[];
  imageUrl?: string | null;
}

export interface QuizOption {
  emoji: string;
  label: string;
  sub?: string;
}

export type QuizQuestionType = 'single' | 'multi';

export interface QuizQuestion {
  /** Stable key used both as the answer bucket and the result field. */
  key: string;
  /** Small section eyebrow shown above the title, e.g. "WHERE YOU ARE". */
  part: string;
  type: QuizQuestionType;
  title: string;
  subtitle: string;
  options: QuizOption[];
  /** Minimum selections required to advance (multi only). Defaults to 1. */
  min?: number;
}

export type InterstitialId = 'status' | 'gap' | 'solution' | 'summary';

export type FlowStep =
  | { kind: 'question'; key: string }
  | { kind: 'interstitial'; id: InterstitialId };

export interface QuizResults {
  // ---- Core taste fields (consumed across the app — always populated) ----
  scentFamilies: string[];
  favoriteNotes: string[];
  occasions: string[];
  priorities: string[];
  // ---- Extended personalization (optional; stored in profile.scent_quiz) ----
  experienceLevel?: string | null;
  collectionSize?: string | null;
  struggles?: string[];
  discoveryStyle?: string | null;
  intensity?: string | null;
  personality?: string[];
  seasons?: string[];
  goals?: string[];
  budget?: string | null;
  adventurousness?: string | null;
  signatureStatus?: string | null;
  gender?: string | null;
  completedAt: string;
}

/**
 * The full quiz question set. Labels for `scentFamilies` MUST stay in sync with
 * the keys in `lib/scent-archetype.ts` (FAMILY_META) or archetype computation
 * silently breaks.
 */
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ===================== ACT 1 — WHERE YOU ARE =====================
  {
    key: 'experienceLevel',
    part: 'WHERE YOU ARE',
    type: 'single',
    title: 'Where are you on your\nfragrance journey?',
    subtitle: 'Be honest — this shapes everything we show you',
    options: [
      { emoji: '🌱', label: 'Just getting started', sub: 'Curious and exploring' },
      { emoji: '👃', label: 'Casual wearer', sub: 'A few bottles I like' },
      { emoji: '🎯', label: 'Enthusiast', sub: 'I know my notes' },
      { emoji: '👑', label: 'Serious collector', sub: 'Fragrance is a passion' },
    ],
  },
  {
    key: 'collectionSize',
    part: 'WHERE YOU ARE',
    type: 'single',
    title: 'How many fragrances\ndo you own today?',
    subtitle: 'Your starting point',
    options: [
      { emoji: '🕳️', label: '0–1', sub: 'Basically starting fresh' },
      { emoji: '🧴', label: '2–5', sub: 'A small lineup' },
      { emoji: '🗄️', label: '6–15', sub: 'A real rotation' },
      { emoji: '🏛️', label: '16+', sub: 'A full wardrobe' },
    ],
  },
  {
    key: 'struggles',
    part: 'WHERE YOU ARE',
    type: 'multi',
    title: "What's frustrating\nabout fragrance now?",
    subtitle: 'Pick everything that rings true',
    options: [
      { emoji: '💸', label: 'I blind-buy and regret it' },
      { emoji: '🤯', label: 'Too many options, I feel lost' },
      { emoji: '🔁', label: 'I wear the same one on repeat' },
      { emoji: '🧐', label: "I can't find my signature" },
      { emoji: '🫥', label: 'I forget what I own' },
      { emoji: '🙈', label: "I don't know what suits me" },
    ],
  },
  {
    key: 'discoveryStyle',
    part: 'WHERE YOU ARE',
    type: 'single',
    title: 'How do you find\nnew scents today?',
    subtitle: 'Your current method',
    options: [
      { emoji: '🏬', label: 'Wandering store counters' },
      { emoji: '👥', label: 'Friends & family' },
      { emoji: '📱', label: 'Social media & reviews' },
      { emoji: '🤷', label: "I don't, really" },
    ],
  },

  // ===================== ACT 2 — WHAT YOU LOVE =====================
  {
    key: 'scentFamilies',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Which scent families\ndraw you in?',
    subtitle: "Pick all you're drawn to — the first is your lead",
    options: [
      { emoji: '🍋', label: 'Fresh & Citrus', sub: 'Clean, bright, zesty' },
      { emoji: '🌹', label: 'Floral', sub: 'Romantic, feminine, blooming' },
      { emoji: '🌲', label: 'Woody & Earthy', sub: 'Deep, grounded, natural' },
      { emoji: '🕌', label: 'Warm & Oriental', sub: 'Rich, exotic, sensual' },
      { emoji: '🌶️', label: 'Spicy', sub: 'Bold, warming, intense' },
      { emoji: '🍫', label: 'Gourmand', sub: 'Sweet, edible, indulgent' },
      { emoji: '🪵', label: 'Oud & Leather', sub: 'Smoky, animalic, luxurious' },
      { emoji: '🌊', label: 'Aquatic & Green', sub: 'Cool, fresh, outdoorsy' },
    ],
  },
  {
    key: 'favoriteNotes',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Which notes make\nyou lean in?',
    subtitle: 'Pick your favorites',
    options: [
      { emoji: '🍦', label: 'Vanilla' },
      { emoji: '🌹', label: 'Rose' },
      { emoji: '🍊', label: 'Bergamot' },
      { emoji: '🪵', label: 'Sandalwood' },
      { emoji: '🌿', label: 'Vetiver' },
      { emoji: '🍯', label: 'Amber' },
      { emoji: '🌸', label: 'Jasmine' },
      { emoji: '🔥', label: 'Oud' },
    ],
  },
  {
    key: 'intensity',
    part: 'WHAT YOU LOVE',
    type: 'single',
    title: 'How do you like\nto be noticed?',
    subtitle: 'Your ideal presence',
    options: [
      { emoji: '🤫', label: 'Skin scent, intimate', sub: 'Only those close catch it' },
      { emoji: '⚖️', label: 'Balanced presence', sub: 'Noticeable, never loud' },
      { emoji: '💥', label: 'Bold, fills the room', sub: 'Make an entrance' },
    ],
  },
  {
    key: 'personality',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Which vibes\nfeel like you?',
    subtitle: 'Choose the moods you want to wear',
    options: [
      { emoji: '✨', label: 'Clean & polished' },
      { emoji: '🔥', label: 'Warm & sexy' },
      { emoji: '🌿', label: 'Natural & earthy' },
      { emoji: '🌙', label: 'Mysterious & dark' },
      { emoji: '🍸', label: 'Playful & sweet' },
      { emoji: '🏔️', label: 'Fresh & sporty' },
    ],
  },
  {
    key: 'seasons',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'When do you reach\nfor fragrance most?',
    subtitle: 'Pick your seasons',
    options: [
      { emoji: '🌸', label: 'Spring' },
      { emoji: '☀️', label: 'Summer' },
      { emoji: '🍂', label: 'Fall' },
      { emoji: '❄️', label: 'Winter' },
    ],
  },
  {
    key: 'occasions',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Where will these\nscents show up?',
    subtitle: 'Select your main occasions',
    options: [
      { emoji: '💼', label: 'Office' },
      { emoji: '🌙', label: 'Date Night' },
      { emoji: '☀️', label: 'Everyday' },
      { emoji: '🎉', label: 'Special Events' },
      { emoji: '🏖️', label: 'Summer Days' },
      { emoji: '❄️', label: 'Winter Nights' },
    ],
  },

  // ===================== ACT 3 — WHERE YOU WANT TO BE =====================
  {
    key: 'goals',
    part: 'WHERE YOU WANT TO BE',
    type: 'multi',
    title: 'What should ScentBuddy\nhelp you do?',
    subtitle: 'Pick your goals — this is the finish line',
    options: [
      { emoji: '🎯', label: 'Find my signature scent' },
      { emoji: '🧠', label: 'Build a smart, curated collection' },
      { emoji: '💸', label: 'Stop wasting money on bad buys' },
      { emoji: '💬', label: 'Get more compliments' },
      { emoji: '💎', label: 'Discover niche hidden gems' },
      { emoji: '📖', label: 'Track & remember what I own' },
    ],
  },
  {
    key: 'priorities',
    part: 'WHERE YOU WANT TO BE',
    type: 'multi',
    title: 'What matters most\nin a fragrance?',
    subtitle: 'Choose your priorities',
    options: [
      { emoji: '⏳', label: 'Long lasting' },
      { emoji: '💨', label: 'Strong projection' },
      { emoji: '🤫', label: 'Subtle & intimate' },
      { emoji: '💎', label: 'Unique & niche' },
      { emoji: '💰', label: 'Great value' },
      { emoji: '🎯', label: 'Versatile' },
    ],
  },
  {
    key: 'budget',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: "What's your sweet\nspot per bottle?",
    subtitle: 'So we recommend within reach',
    options: [
      { emoji: '🪙', label: 'Under $50', sub: 'Smart value picks' },
      { emoji: '💵', label: '$50–120', sub: 'The comfortable range' },
      { emoji: '💳', label: '$120–250', sub: 'Room for niche' },
      { emoji: '💎', label: "Sky's the limit", sub: 'Show me the best' },
    ],
  },
  {
    key: 'adventurousness',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'How adventurous\ndo you want to get?',
    subtitle: 'We calibrate your recommendations to this',
    options: [
      { emoji: '🛡️', label: 'Safe & wearable', sub: 'Crowd-pleasers first' },
      { emoji: '🧭', label: 'A little exploration', sub: 'Familiar with a twist' },
      { emoji: '🚀', label: 'Bold & unexpected', sub: 'Surprise me' },
    ],
  },
  {
    key: 'signatureStatus',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'Where are you with\na signature scent?',
    subtitle: 'Your endgame',
    options: [
      { emoji: '💍', label: 'I have one I love' },
      { emoji: '🔍', label: "I'm still searching" },
      { emoji: '🎭', label: 'I want a wardrobe, not just one' },
    ],
  },
  {
    key: 'gender',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'Which direction\nshould we lean?',
    subtitle: 'We can always mix it up later',
    options: [
      { emoji: '🌫️', label: 'Masculine' },
      { emoji: '🌸', label: 'Feminine' },
      { emoji: '☯️', label: 'Unisex' },
      { emoji: '🌈', label: 'Show me everything' },
    ],
  },
];

export const QUESTION_BY_KEY: Record<string, QuizQuestion> = QUIZ_QUESTIONS.reduce(
  (acc, q) => {
    acc[q.key] = q;
    return acc;
  },
  {} as Record<string, QuizQuestion>,
);

/**
 * Ordered walk through the quiz: questions interleaved with narrative
 * interstitials (current status → gap → how the app closes it → summary).
 */
export const QUIZ_FLOW: FlowStep[] = [
  { kind: 'question', key: 'experienceLevel' },
  { kind: 'question', key: 'collectionSize' },
  { kind: 'question', key: 'struggles' },
  { kind: 'question', key: 'discoveryStyle' },
  { kind: 'interstitial', id: 'status' },
  { kind: 'question', key: 'scentFamilies' },
  { kind: 'question', key: 'favoriteNotes' },
  { kind: 'question', key: 'intensity' },
  { kind: 'question', key: 'personality' },
  { kind: 'question', key: 'seasons' },
  { kind: 'question', key: 'occasions' },
  { kind: 'question', key: 'goals' },
  { kind: 'question', key: 'priorities' },
  { kind: 'question', key: 'budget' },
  { kind: 'question', key: 'adventurousness' },
  { kind: 'question', key: 'signatureStatus' },
  { kind: 'question', key: 'gender' },
  { kind: 'interstitial', id: 'gap' },
  { kind: 'interstitial', id: 'solution' },
  { kind: 'interstitial', id: 'summary' },
];

export const QUIZ_QUESTION_COUNT = QUIZ_QUESTIONS.length;
