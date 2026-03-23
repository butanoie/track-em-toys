import type { CollectionCondition } from '@/lib/zod-schemas';

export interface ConditionConfig {
  label: string;
  shortCode: string;
  className: string;
}

export const CONDITION_CONFIG: Record<CollectionCondition, ConditionConfig> = {
  mint_sealed: {
    label: 'Mint Sealed',
    shortCode: 'MISB',
    className:
      'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700',
  },
  opened_complete: {
    label: 'Opened Complete',
    shortCode: 'OC',
    className: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900 dark:text-sky-300 dark:border-sky-700',
  },
  opened_incomplete: {
    label: 'Opened Incomplete',
    shortCode: 'OI',
    className: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950 dark:text-sky-400 dark:border-sky-800',
  },
  loose_complete: {
    label: 'Loose Complete',
    shortCode: 'LC',
    className:
      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600',
  },
  loose_incomplete: {
    label: 'Loose Incomplete',
    shortCode: 'LI',
    className:
      'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
  damaged: {
    label: 'Damaged',
    shortCode: 'DMG',
    className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700',
  },
  unknown: {
    label: 'Unknown',
    shortCode: '?',
    className: 'bg-zinc-100 text-zinc-500 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-600',
  },
};

export const CONDITION_OPTIONS = Object.entries(CONDITION_CONFIG) as Array<[CollectionCondition, ConditionConfig]>;
