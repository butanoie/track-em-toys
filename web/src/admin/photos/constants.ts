import type { RejectionReasonCode } from '@/lib/zod-schemas';

/**
 * Maximum delay between the two `R` presses of the reject chord, in
 * milliseconds. Imported by `useRejectChord` and (via `REJECT_CHORD_WINDOW_MS`)
 * by tests so the value lives in exactly one place.
 */
export const REJECT_CHORD_WINDOW_MS = 500;

/**
 * The pending queue API caps `photos` at 200; `total_count` is unbounded
 * and drives the `PendingQueueBanner` warning when more than 200 are
 * actually pending.
 */
export const MAX_QUEUE_SIZE = 200;

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
