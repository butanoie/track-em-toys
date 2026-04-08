import { useMutation, useQueryClient } from '@tanstack/react-query';
import { decidePhoto, type DecidePhotoBody, type DecideResult } from '@/admin/photos/api';

interface DecideVariables {
  id: string;
  body: DecidePhotoBody;
}

/**
 * Mutation that decides a single pending photo (approve / reject /
 * demote-to-pending).
 *
 * Returns the `DecideResult` discriminated union as-is so the page can
 * branch on `result.conflict` and surface the 409 banner without losing
 * the typed `current_status` field. (See D14.1 #7 — `decidePhoto` uses
 * `apiFetch` rather than `apiFetchJson` precisely so 409 stays in the
 * value channel.)
 *
 * `onSuccess` invalidates the broad `['admin', 'photos']` prefix, which
 * refreshes both the queue list AND the sidebar pending-count badge in
 * one call.
 *
 * **Important**: this hook intentionally does NOT advance the page's
 * `activeIndex` on success. The list refetch implicitly removes the
 * decided photo from the array, so the existing `activeIndex` already
 * points at what was the next photo. Auto-advancing would skip one. See
 * D14.2 #2.
 */
export function usePhotoDecisionMutation() {
  const queryClient = useQueryClient();

  return useMutation<DecideResult, Error, DecideVariables>({
    mutationFn: ({ id, body }) => decidePhoto(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'photos'] });
    },
  });
}
