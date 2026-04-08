import type { PhotoApprovalItem } from '@/lib/zod-schemas';

/**
 * Builds a fully-populated `PhotoApprovalItem` for component tests.
 * Override only the fields you care about — the rest stay realistic.
 */
export function makePhotoApprovalItem(overrides: Partial<PhotoApprovalItem> = {}): PhotoApprovalItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    item: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Optimus Prime',
      slug: 'optimus-prime',
      franchise_slug: 'transformers',
      thumbnail_url: 'transformers/optimus-prime-thumb.webp',
    },
    photo: {
      url: 'pending/optimus-prime-1.webp',
      caption: null,
      visibility: 'public',
    },
    uploader: {
      id: '33333333-3333-4333-8333-333333333333',
      display_name: 'Test Contributor',
      email: 'contributor@example.com',
    },
    contribution: {
      id: '44444444-4444-4444-8444-444444444444',
      contributed_by: '33333333-3333-4333-8333-333333333333',
      consent_version: '1',
      consent_granted_at: '2026-04-01T12:00:00.000Z',
      intent: 'catalog_and_training',
    },
    existing_photos: [
      { id: '55555555-5555-4555-8555-555555555555', url: 'transformers/op-1.webp' },
      { id: '66666666-6666-4666-8666-666666666666', url: 'transformers/op-2.webp' },
    ],
    can_decide: true,
    created_at: '2026-04-05T10:00:00.000Z',
    ...overrides,
  };
}
