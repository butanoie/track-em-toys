import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { listPendingPhotos } from '@/admin/photos/api';
import type { PhotoApprovalListResponse } from '@/lib/zod-schemas';

/**
 * Page-level query for the photo approval queue.
 *
 * The PR 1 endpoint takes no parameters and returns the full pending
 * queue (no LIMIT — curators decide how many to review, see project
 * memory). `keepPreviousData` smooths the refetch after a decision so
 * the canvas does not flash empty between the mutation success and the
 * next list payload.
 */
export function useAdminPhotoApprovals() {
  return useQuery<PhotoApprovalListResponse>({
    queryKey: ['admin', 'photos', 'pending'],
    queryFn: listPendingPhotos,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
