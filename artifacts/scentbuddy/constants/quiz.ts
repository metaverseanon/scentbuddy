import {
  type Icon,
  Plant,
  Smiley,
  Target,
  Crown,
  CircleDashed,
  Flask,
  Stack,
  Bank,
  Money,
  Brain,
  Repeat,
  MagnifyingGlass,
  EyeSlash,
  Question,
  Storefront,
  Users,
  DeviceMobile,
  SmileyMeh,
  OrangeSlice,
  Flower,
  Tree,
  Mosque,
  Pepper,
  Cookie,
  Campfire,
  Waves,
  IceCream,
  Orange,
  Leaf,
  Drop,
  FlowerLotus,
  Fire,
  SpeakerLow,
  Scales,
  SpeakerHigh,
  Sparkle,
  Moon,
  Martini,
  Mountains,
  Sun,
  Snowflake,
  Briefcase,
  Confetti,
  Umbrella,
  ChatCircle,
  Diamond,
  BookOpen,
  Hourglass,
  Wind,
  PiggyBank,
  ArrowsOutCardinal,
  Coin,
  CurrencyDollar,
  CreditCard,
  Shield,
  Compass,
  Rocket,
  Heart,
  TShirt,
  GenderMale,
  GenderFemale,
  YinYang,
  Rainbow,
} from 'phosphor-react-native';

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
  icon: Icon;
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
      { icon: Plant, label: 'Just getting started', sub: 'Curious and exploring' },
      { icon: Smiley, label: 'Casual wearer', sub: 'A few bottles I like' },
      { icon: Target, label: 'Enthusiast', sub: 'I know my notes' },
      { icon: Crown, label: 'Serious collector', sub: 'Fragrance is a passion' },
    ],
  },
  {
    key: 'collectionSize',
    part: 'WHERE YOU ARE',
    type: 'single',
    title: 'How many fragrances\ndo you own today?',
    subtitle: 'Your starting point',
    options: [
      { icon: CircleDashed, label: '0–1', sub: 'Basically starting fresh' },
      { icon: Flask, label: '2–5', sub: 'A small lineup' },
      { icon: Stack, label: '6–15', sub: 'A real rotation' },
      { icon: Bank, label: '16+', sub: 'A full wardrobe' },
    ],
  },
  {
    key: 'struggles',
    part: 'WHERE YOU ARE',
    type: 'multi',
    title: "What's frustrating\nabout fragrance now?",
    subtitle: 'Pick everything that rings true',
    options: [
      { icon: Money, label: 'I blind-buy and regret it' },
      { icon: Brain, label: 'Too many options, I feel lost' },
      { icon: Repeat, label: 'I wear the same one on repeat' },
      { icon: MagnifyingGlass, label: "I can't find my signature" },
      { icon: EyeSlash, label: 'I forget what I own' },
      { icon: Question, label: "I don't know what suits me" },
    ],
  },
  {
    key: 'discoveryStyle',
    part: 'WHERE YOU ARE',
    type: 'single',
    title: 'How do you find\nnew scents today?',
    subtitle: 'Your current method',
    options: [
      { icon: Storefront, label: 'Wandering store counters' },
      { icon: Users, label: 'Friends & family' },
      { icon: DeviceMobile, label: 'Social media & reviews' },
      { icon: SmileyMeh, label: "I don't, really" },
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
      { icon: OrangeSlice, label: 'Fresh & Citrus', sub: 'Clean, bright, zesty' },
      { icon: Flower, label: 'Floral', sub: 'Romantic, feminine, blooming' },
      { icon: Tree, label: 'Woody & Earthy', sub: 'Deep, grounded, natural' },
      { icon: Mosque, label: 'Warm & Oriental', sub: 'Rich, exotic, sensual' },
      { icon: Pepper, label: 'Spicy', sub: 'Bold, warming, intense' },
      { icon: Cookie, label: 'Gourmand', sub: 'Sweet, edible, indulgent' },
      { icon: Campfire, label: 'Oud & Leather', sub: 'Smoky, animalic, luxurious' },
      { icon: Waves, label: 'Aquatic & Green', sub: 'Cool, fresh, outdoorsy' },
    ],
  },
  {
    key: 'favoriteNotes',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Which notes make\nyou lean in?',
    subtitle: 'Pick your favorites',
    options: [
      { icon: IceCream, label: 'Vanilla' },
      { icon: Flower, label: 'Rose' },
      { icon: Orange, label: 'Bergamot' },
      { icon: Tree, label: 'Sandalwood' },
      { icon: Leaf, label: 'Vetiver' },
      { icon: Drop, label: 'Amber' },
      { icon: FlowerLotus, label: 'Jasmine' },
      { icon: Fire, label: 'Oud' },
    ],
  },
  {
    key: 'intensity',
    part: 'WHAT YOU LOVE',
    type: 'single',
    title: 'How do you like\nto be noticed?',
    subtitle: 'Your ideal presence',
    options: [
      { icon: SpeakerLow, label: 'Skin scent, intimate', sub: 'Only those close catch it' },
      { icon: Scales, label: 'Balanced presence', sub: 'Noticeable, never loud' },
      { icon: SpeakerHigh, label: 'Bold, fills the room', sub: 'Make an entrance' },
    ],
  },
  {
    key: 'personality',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Which vibes\nfeel like you?',
    subtitle: 'Choose the moods you want to wear',
    options: [
      { icon: Sparkle, label: 'Clean & polished' },
      { icon: Fire, label: 'Warm & sexy' },
      { icon: Leaf, label: 'Natural & earthy' },
      { icon: Moon, label: 'Mysterious & dark' },
      { icon: Martini, label: 'Playful & sweet' },
      { icon: Mountains, label: 'Fresh & sporty' },
    ],
  },
  {
    key: 'seasons',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'When do you reach\nfor fragrance most?',
    subtitle: 'Pick your seasons',
    options: [
      { icon: Flower, label: 'Spring' },
      { icon: Sun, label: 'Summer' },
      { icon: Leaf, label: 'Fall' },
      { icon: Snowflake, label: 'Winter' },
    ],
  },
  {
    key: 'occasions',
    part: 'WHAT YOU LOVE',
    type: 'multi',
    title: 'Where will these\nscents show up?',
    subtitle: 'Select your main occasions',
    options: [
      { icon: Briefcase, label: 'Office' },
      { icon: Moon, label: 'Date Night' },
      { icon: Sun, label: 'Everyday' },
      { icon: Confetti, label: 'Special Events' },
      { icon: Umbrella, label: 'Summer Days' },
      { icon: Snowflake, label: 'Winter Nights' },
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
      { icon: Target, label: 'Find my signature scent' },
      { icon: Brain, label: 'Build a smart, curated collection' },
      { icon: Money, label: 'Stop wasting money on bad buys' },
      { icon: ChatCircle, label: 'Get more compliments' },
      { icon: Diamond, label: 'Discover niche hidden gems' },
      { icon: BookOpen, label: 'Track & remember what I own' },
    ],
  },
  {
    key: 'priorities',
    part: 'WHERE YOU WANT TO BE',
    type: 'multi',
    title: 'What matters most\nin a fragrance?',
    subtitle: 'Choose your priorities',
    options: [
      { icon: Hourglass, label: 'Long lasting' },
      { icon: Wind, label: 'Strong projection' },
      { icon: SpeakerLow, label: 'Subtle & intimate' },
      { icon: Diamond, label: 'Unique & niche' },
      { icon: PiggyBank, label: 'Great value' },
      { icon: ArrowsOutCardinal, label: 'Versatile' },
    ],
  },
  {
    key: 'budget',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: "What's your sweet\nspot per bottle?",
    subtitle: 'So we recommend within reach',
    options: [
      { icon: Coin, label: 'Under $50', sub: 'Smart value picks' },
      { icon: CurrencyDollar, label: '$50–120', sub: 'The comfortable range' },
      { icon: CreditCard, label: '$120–250', sub: 'Room for niche' },
      { icon: Diamond, label: "Sky's the limit", sub: 'Show me the best' },
    ],
  },
  {
    key: 'adventurousness',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'How adventurous\ndo you want to get?',
    subtitle: 'We calibrate your recommendations to this',
    options: [
      { icon: Shield, label: 'Safe & wearable', sub: 'Crowd-pleasers first' },
      { icon: Compass, label: 'A little exploration', sub: 'Familiar with a twist' },
      { icon: Rocket, label: 'Bold & unexpected', sub: 'Surprise me' },
    ],
  },
  {
    key: 'signatureStatus',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'Where are you with\na signature scent?',
    subtitle: 'Your endgame',
    options: [
      { icon: Heart, label: 'I have one I love' },
      { icon: MagnifyingGlass, label: "I'm still searching" },
      { icon: TShirt, label: 'I want a wardrobe, not just one' },
    ],
  },
  {
    key: 'gender',
    part: 'WHERE YOU WANT TO BE',
    type: 'single',
    title: 'Which direction\nshould we lean?',
    subtitle: 'We can always mix it up later',
    options: [
      { icon: GenderMale, label: 'Masculine' },
      { icon: GenderFemale, label: 'Feminine' },
      { icon: YinYang, label: 'Unisex' },
      { icon: Rainbow, label: 'Show me everything' },
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
