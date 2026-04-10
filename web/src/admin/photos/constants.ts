import type { RejectionReasonCode } from '@/lib/zod-schemas';

/**
 * The pending queue API caps `photos` at 200; `total_count` is unbounded
 * and drives the `PendingQueueBanner` warning when more than 200 are
 * actually pending.
 */
export const MAX_QUEUE_SIZE = 200;

/**
 * Hamming distance threshold below which an existing approved photo is
 * considered a near-duplicate of the pending photo. Matches the curator's
 * expectation that "≤4 bits different" means "basically the same image,
 * probably a cropped/rescaled variant". The upload pipeline uses a looser
 * threshold (≤10) for hard-rejecting duplicates; at review time we use a
 * tighter threshold because same-item dupes are not automatically a
 * reject — sometimes the curator wants multiple angles.
 */
export const NEAR_DUPLICATE_DISTANCE = 4;

/**
 * localStorage key for the first-visit shortcut overlay. Stays without
 * the `trackem:` prefix per D8: it's a UI preference, not a security
 * flag, and the base plan + amendment use this exact key name.
 */
export const SHORTCUTS_SEEN_KEY = 'photo-approval-shortcuts-seen';

/**
 * Reject reasons in `1..6` keyboard order. The `key` field doubles as
 * the `react-hotkeys-hook` binding token AND the visible label
 * indicator on the button. Order is load-bearing — never reorder
 * without updating the keyboard handler in `PhotoApprovalPage`.
 */
export interface RejectionReason {
  code: RejectionReasonCode;
  label: string;
  key: '1' | '2' | '3' | '4' | '5' | '6';
}

export const REJECTION_REASONS: readonly RejectionReason[] = [
  { code: 'blurry', label: 'Blurry', key: '1' },
  { code: 'wrong_item', label: 'Wrong item', key: '2' },
  { code: 'nsfw', label: 'NSFW', key: '3' },
  { code: 'duplicate', label: 'Duplicate', key: '4' },
  { code: 'poor_quality', label: 'Poor quality', key: '5' },
  { code: 'other', label: 'Other', key: '6' },
];
