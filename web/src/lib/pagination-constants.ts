import { z } from 'zod';

export const PAGE_LIMIT_OPTIONS = [20, 50, 100] as const;
export type PageLimitOption = (typeof PAGE_LIMIT_OPTIONS)[number];
export const DEFAULT_PAGE_LIMIT: PageLimitOption = 20;

/** Zod schema for limit URL search param — coerces string to number, validates against PAGE_LIMIT_OPTIONS. */
export const pageLimitSchema = z.coerce
  .number()
  .int()
  .refine((v): v is number => (PAGE_LIMIT_OPTIONS as readonly number[]).includes(v))
  .optional()
  .catch(undefined);
