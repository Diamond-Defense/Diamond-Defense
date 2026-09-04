import type { SituationDifficulty, TeachingCategoryId } from './models';

export const SITUATION_DIFFICULTIES = [
  { id: 'foundational', label: 'Foundational' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
] as const;

export const TEACHING_CATEGORIES: ReadonlyArray<{
  id: TeachingCategoryId;
  label: string;
}> = [
  { id: 'cutoffs-relays', label: 'Cutoffs & Relays' },
  { id: 'backups-rotations', label: 'Backups & Rotations' },
  { id: 'force-plays', label: 'Force Plays' },
  { id: 'fly-ball-priority', label: 'Fly-Ball Priority' },
  { id: 'rundowns', label: 'Rundowns' },
  { id: 'bunt-defense', label: 'Bunt Defense' },
  { id: 'first-third-defense', label: 'First-and-Third Defense' },
  { id: 'double-plays', label: 'Double Plays' },
  { id: 'base-coverage', label: 'Base Coverage' },
  { id: 'pitcher-catcher-responsibilities', label: 'Pitcher & Catcher Responsibilities' },
  { id: 'tag-ups-sacrifice-flies', label: 'Tag-Ups & Sacrifice Flies' },
  { id: 'situational-alignment', label: 'Situational Alignment' },
];

const TEACHING_CATEGORY_IDS = new Set(TEACHING_CATEGORIES.map(({ id }) => id));

export function normalizeDifficulty(value: unknown): SituationDifficulty {
  const difficulty = String(value || '').trim().toLowerCase();
  if (difficulty === 'beginner') return 'foundational';
  if (difficulty === 'foundational' || difficulty === 'intermediate' || difficulty === 'advanced') {
    return difficulty;
  }
  throw new Error('Situation difficulty must be foundational, intermediate, or advanced.');
}

export function normalizeTeachingCategories(input: {
  primaryCategory?: unknown;
  relatedCategories?: unknown;
}): { primaryCategory: TeachingCategoryId; relatedCategories: TeachingCategoryId[] } {
  const primaryCategory = String(input.primaryCategory || '').trim() as TeachingCategoryId;
  if (!TEACHING_CATEGORY_IDS.has(primaryCategory)) {
    throw new Error('Choose a valid primary teaching category.');
  }
  const related = Array.isArray(input.relatedCategories) ? input.relatedCategories : [];
  const relatedCategories = [...new Set(related.map((value) => String(value).trim() as TeachingCategoryId))]
    .filter((id) => id !== primaryCategory);
  if (relatedCategories.some((id) => !TEACHING_CATEGORY_IDS.has(id))) {
    throw new Error('Choose only valid related teaching categories.');
  }
  return { primaryCategory, relatedCategories };
}

export function teachingCategoryLabel(id: unknown): string {
  return TEACHING_CATEGORIES.find((category) => category.id === id)?.label || String(id || '');
}
