import type { AdminUserRow, UserRole } from '@/lib/zod-schemas';

export type PendingAction =
  | { type: 'deactivate' | 'reactivate' | 'purge'; user: AdminUserRow }
  | { type: 'role_change'; user: AdminUserRow; newRole: UserRole };

// Re-exported from the shared admin error helpers — these used to live here
// when AdminUsersPage was the only consumer. Phase 1.9b's PhotoApprovalPage
// also needs them, so they were extracted to admin/lib/api-errors.ts.
export { isBannerError, getMutationErrorMessage } from '@/admin/lib/api-errors';
