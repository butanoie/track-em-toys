import { ApiError } from '@/lib/api-client';

/**
 * Returns true when the error is an ApiError with a status code that should
 * be displayed inline as an ErrorBanner rather than a transient toast.
 *
 * Used by admin pages to distinguish "the server is telling you something
 * actionable" (400/403/404/409) from "something failed transiently" (5xx,
 * network).
 */
export function isBannerError(err: unknown): err is ApiError {
  return err instanceof ApiError && [400, 403, 404, 409].includes(err.status);
}

/**
 * Extracts a human-readable message from an error. For banner-class ApiErrors,
 * returns the server-provided message; otherwise returns a generic fallback.
 */
export function getMutationErrorMessage(err: unknown): string {
  if (isBannerError(err)) {
    return err.body.error;
  }
  return 'An unexpected error occurred. Please try again.';
}
