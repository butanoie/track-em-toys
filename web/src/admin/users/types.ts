import { ApiError } from '@/lib/api-client';
import type { AdminUserRow, UserRole } from '@/lib/zod-schemas';

export type PendingAction =
  | { type: 'deactivate' | 'reactivate' | 'purge'; user: AdminUserRow }
  | { type: 'role_change'; user: AdminUserRow; newRole: UserRole };

export function isBannerError(err: unknown): err is ApiError {
  return err instanceof ApiError && [400, 403, 404, 409].includes(err.status);
}

export function getMutationErrorMessage(err: unknown): string {
  if (isBannerError(err)) {
    return err.body.error;
  }
  return 'An unexpected error occurred. Please try again.';
}
