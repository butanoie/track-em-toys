/**
 * Shared consent + contribution constants and copy for the photo contribution flow.
 *
 * Consolidates values used by multiple dialogs (ContributeDialog,
 * AddToCollectionDialog) so future edits happen in one place. See
 * `docs/plans/Photo_Contribution_Visibility_Plan.md` for the full contract.
 */

import type { ContributeIntent } from '@/lib/zod-schemas';

/**
 * Version of the consent text the contributor is agreeing to. Bumped only when
 * the *license grant* changes, not when the UI around it changes. The app is
 * still pre-launch with zero production contributors, so the value stays at
 * `'1.0'`.
 */
export const CONSENT_VERSION = '1.0';

/**
 * Default intent for every contribution surface on the web (standalone
 * ContributeDialog AND the combined AddToCollectionDialog radio).
 *
 * Why `training_only`: the catalog is deliberately curated. Every contributed
 * photo trains the ML model regardless of intent — `catalog_and_training` adds
 * public catalog visibility on top of the same training donation, it is not an
 * alternative to it. Defaulting to `training_only` keeps the curated public
 * surface lean while still feeding the model.
 */
export const DEFAULT_CONTRIBUTE_INTENT: ContributeIntent = 'training_only';

/**
 * The single sentence granting Track'em Toys a license to use, display, and
 * modify a contributed photo. This text is legally load-bearing and must be
 * byte-identical across every surface where it appears (the full 4-bullet
 * callout in `ContributeDialog` and the condensed inline disclaimer in
 * `AddToCollectionDialog`). Extracted to a single constant so a future edit
 * cannot silently drift between the two dialogs.
 */
export const LICENSE_GRANT_TEXT =
  "You grant Track'em Toys a perpetual, non-exclusive, royalty-free license to use, display, and modify this photo for catalog and ML training";
