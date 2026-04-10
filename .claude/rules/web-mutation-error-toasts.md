Mutation `onError` handlers that toast MUST surface the server-provided message via `getMutationErrorMessage` from `@/lib/api-errors`, not a generic "Failed to X" string.

**Why:** 4xx `ApiError` bodies carry actionable information the user needs — e.g., 409 "This photo has already been contributed", 400 "Consent must be acknowledged", 403 "Cannot decide on your own contribution". A generic "Failed to contribute photo" silently hides which of these failure modes actually fired, leaving the user unable to understand or recover. In Phase 1.9b the collection photo contribute flow was doing exactly this and the user had no way to tell why their second contribution of the same photo kept "failing". See commit `39b94b3`.

**How to apply:**

1. In any `useMutation` `onError` handler that calls `toast.error(...)`, destructure the error argument and pass it through `getMutationErrorMessage`:
   ```typescript
   import { getMutationErrorMessage } from '@/lib/api-errors';

   onError: (err) => {
     toast.error(getMutationErrorMessage(err));
   },
   ```
2. `getMutationErrorMessage` returns the server-provided message for banner-class `ApiError`s (status 400/403/404/409) and a generic `"An unexpected error occurred. Please try again."` fallback for 5xx/network/unknown errors. It never throws, never returns an empty string, and never regresses compared to hard-coded strings.
3. For non-toast error surfaces (inline banners, form-level errors), use `isBannerError(err)` from the same module to decide whether the server message is trustworthy enough to display inline.
4. Do NOT use `err instanceof Error ? err.message : 'Failed'` as a shortcut — `Error.message` on an `ApiError` happens to work today but duplicates logic that belongs in the shared helper, and may drift if `ApiError` is later subclassed.

`isBannerError` / `getMutationErrorMessage` live in `web/src/lib/api-errors.ts`. The old path `@/admin/lib/api-errors` is a re-export shim for backward compatibility — prefer the canonical location in new code.
