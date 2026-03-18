import { ApiError } from '@/lib/api-client';
import type { AdminUserRow, UserRole } from '@/lib/zod-schemas';

export type PendingAction =
  | { type: 'deactivate' | 'reactivate' | 'purge'; user: AdminUserRow }
  | { type: 'role_change'; user: AdminUserRow; newRole: UserRole };

export function getMutationErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 || err.status === 403) return err.body.error;
    if (err.status === 404) return 'User not found.';
  }
  return 'An unexpected error occurred. Please try again.';
}
