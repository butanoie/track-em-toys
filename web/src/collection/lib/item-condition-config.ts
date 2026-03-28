export interface ItemConditionConfig {
  label: string;
  shortLabel: string;
  description: string;
  className: string;
}

/** Default C-grade for new collection items (C5 = Good+). */
export const DEFAULT_ITEM_CONDITION = 5;

export const ITEM_CONDITION_CONFIG: Record<number, ItemConditionConfig> = {
  1: {
    label: 'C1 — Junk',
    shortLabel: 'C1',
    description: 'Severely damaged, incomplete, parts-only condition',
    className: 'bg-red-200 text-red-800 border-red-400 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  },
  2: {
    label: 'C2 — Poor',
    shortLabel: 'C2',
    description: 'Significant damage, broken parts, heavy discoloration',
    className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700',
  },
  3: {
    label: 'C3 — Fair',
    shortLabel: 'C3',
    description: 'Heavy wear, loose joints, paint loss',
    className: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800',
  },
  4: {
    label: 'C4 — Good',
    shortLabel: 'C4',
    description: 'Noticeable wear, visible scuffs, still displayable',
    className:
      'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-300 dark:border-amber-700',
  },
  5: {
    label: 'C5 — Good+',
    shortLabel: 'C5',
    description: 'Moderate paint wear, some joint looseness',
    className:
      'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800',
  },
  6: {
    label: 'C6 — Very Good',
    shortLabel: 'C6',
    description: 'Some paint wear, joints functional, light marks',
    className: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
  },
  7: {
    label: 'C7 — Very Good+',
    shortLabel: 'C7',
    description: 'Light wear, small paint chips or minor scuffs',
    className: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900 dark:text-sky-300 dark:border-sky-700',
  },
  8: {
    label: 'C8 — Excellent',
    shortLabel: 'C8',
    description: 'Minor wear, tight joints, paint nearly flawless',
    className:
      'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800',
  },
  9: {
    label: 'C9 — Near Mint',
    shortLabel: 'C9',
    description: 'Near perfect, only the slightest imperfection',
    className:
      'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700',
  },
  10: {
    label: 'C10 — Mint',
    shortLabel: 'C10',
    description: 'Perfect, factory-fresh, no flaws whatsoever',
    className:
      'bg-emerald-200 text-emerald-800 border-emerald-400 dark:bg-emerald-900 dark:text-emerald-200 dark:border-emerald-600',
  },
};

export const ITEM_CONDITION_GRADES = Object.keys(ITEM_CONDITION_CONFIG).map(Number);
