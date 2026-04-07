import { describe, it, expect } from 'vitest';
import { PHOTO_JOIN } from './queries.js';

describe('ml-export queries — PHOTO_JOIN invariants', () => {
  // These tests lock in the rule called out in queries.ts: the ML training
  // pipeline must include BOTH visibility tiers. If anyone adds a visibility
  // filter to the join, these tests fail loudly with a clear message. See
  // Phase 1.6 amendment #148 and docs/plans/Photo_Contribution_Visibility_Plan.md.

  it('joins item_photos on approved status only (preserves training_only inclusion)', () => {
    expect(PHOTO_JOIN).toMatch(/ip\.status\s*=\s*'approved'/);
  });

  it('does NOT filter on ip.visibility — training_only photos must flow into training data', () => {
    // If this test fails because someone added a visibility filter to PHOTO_JOIN,
    // do NOT "fix" the test — the filter itself is the bug. Training-only
    // contributions exist precisely so they can feed the ML pipeline without
    // being publicly visible in the catalog. Adding `AND ip.visibility = 'public'`
    // here would silently exclude them from the training set.
    expect(PHOTO_JOIN).not.toMatch(/visibility/);
  });

  it('is a LEFT JOIN so items with zero approved photos still appear in the result (with photo_id = null)', () => {
    expect(PHOTO_JOIN).toMatch(/LEFT JOIN item_photos/);
  });
});
