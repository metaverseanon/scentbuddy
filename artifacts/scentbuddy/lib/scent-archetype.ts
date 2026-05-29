import { QuizResults } from '@/constants/quiz';

export interface ArchetypeFamily {
  label: string;
  pct: number;
  color: string;
}

export interface ScentArchetype {
  name: string;
  tagline: string;
  description: string;
  families: ArchetypeFamily[];
  searchSeeds: string[];
}

interface FamilyMeta {
  archetype: string;
  tagline: string;
  color: string;
  seed: string;
}

const FAMILY_META: Record<string, FamilyMeta> = {
  'Fresh & Citrus': {
    archetype: 'The Fresh Minimalist',
    tagline: 'Clean, bright, effortless',
    color: '#4FC3F7',
    seed: 'citrus',
  },
  'Floral': {
    archetype: 'The Romantic',
    tagline: 'Soft, blooming, expressive',
    color: '#F48FB1',
    seed: 'rose',
  },
  'Woody & Earthy': {
    archetype: 'The Naturalist',
    tagline: 'Grounded, warm, timeless',
    color: '#A1887F',
    seed: 'sandalwood',
  },
  'Warm & Oriental': {
    archetype: 'The Sensualist',
    tagline: 'Rich, magnetic, unforgettable',
    color: '#CE93D8',
    seed: 'amber',
  },
  'Spicy': {
    archetype: 'The Bold Spirit',
    tagline: 'Daring, warm, intense',
    color: '#FF8A65',
    seed: 'cardamom',
  },
  'Gourmand': {
    archetype: 'The Indulgent',
    tagline: 'Sweet, cozy, irresistible',
    color: '#D7A86E',
    seed: 'vanilla',
  },
  'Oud & Leather': {
    archetype: 'The Connoisseur',
    tagline: 'Deep, luxurious, refined',
    color: '#8D6E63',
    seed: 'oud',
  },
  'Aquatic & Green': {
    archetype: 'The Free Spirit',
    tagline: 'Cool, open, alive',
    color: '#4DB6AC',
    seed: 'marine',
  },
};

const DEFAULT_META: FamilyMeta = {
  archetype: 'The Explorer',
  tagline: 'Curious, open, always discovering',
  color: '#c49a6c',
  seed: 'fragrance',
};

function buildDescription(
  dominant: FamilyMeta,
  families: string[],
  occasions: string[],
  priorities: string[],
): string {
  let text: string;
  if (families.length === 0) {
    text = `You're still discovering your signature scent. ${dominant.tagline}.`;
  } else {
    const familyText =
      families.length === 1
        ? families[0].toLowerCase()
        : `${families.slice(0, -1).map(f => f.toLowerCase()).join(', ')} and ${families[families.length - 1].toLowerCase()}`;
    text = `You're drawn to ${familyText} scents. ${dominant.tagline}.`;
  }

  const occasion = occasions[0];
  if (occasion) {
    text += ` Built for ${occasion.toLowerCase()} and the moments that matter to you.`;
  }

  const priority = priorities[0];
  if (priority) {
    text += ` Above all, you want fragrances that feel ${priority.toLowerCase()}.`;
  }

  return text;
}

export function computeArchetype(results: QuizResults): ScentArchetype {
  const selectedFamilies = (results.scentFamilies ?? []).filter(Boolean);
  const dominantLabel = selectedFamilies[0];
  const dominant = (dominantLabel && FAMILY_META[dominantLabel]) || DEFAULT_META;

  const familyCount = selectedFamilies.length;
  const families: ArchetypeFamily[] = selectedFamilies.map((label, index) => {
    const base = Math.floor(100 / familyCount);
    const remainder = 100 - base * familyCount;
    const pct = base + (index === 0 ? remainder : 0);
    const meta = FAMILY_META[label] ?? DEFAULT_META;
    return { label, pct, color: meta.color };
  });

  const noteSeeds = (results.favoriteNotes ?? []).filter(n => n && n.trim().length >= 3);
  const searchSeeds = noteSeeds.length > 0 ? noteSeeds : [dominant.seed];

  return {
    name: dominant.archetype,
    tagline: dominant.tagline,
    description: buildDescription(
      dominant,
      selectedFamilies,
      results.occasions ?? [],
      results.priorities ?? [],
    ),
    families,
    searchSeeds,
  };
}
