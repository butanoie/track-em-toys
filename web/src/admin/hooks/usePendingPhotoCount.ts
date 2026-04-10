import { useQuery } from '@tanstack/react-query';
import { getPendingPhotoCount } from '@/admin/photos/api';
import type { PhotoApprovalCountResponse } from '@/lib/zod-schemas';

/**
 * Layout-level query that powers the "Photo Approvals" sidebar badge.
 *
 * Lives in `admin/hooks/` (NOT `admin/photos/hooks/`) because the admin
 * layout component sits above the photos feature in the import graph —
 * importing from a feature subdirectory would invert the dependency
 * direction. See D14.1 #2 in `Photo_Approval_Dashboard_Plan_Amendment.md`.
 *
 * `refetchOnWindowFocus: true` paired with `staleTime: 0` is the first
 * focus-refetch in the codebase. The intent is that a curator who switches
 * tabs to do other work and returns sees an up-to-date pending count
 * without a manual refresh. `staleTime: 0` is required: TanStack Query
 * skips focus refetches on fresh data, so any positive staleTime would
 * silently defeat the override.
 */
export function usePendingPhotoCount() {
  return useQuery<PhotoApprovalCountResponse>({
    queryKey: ['admin', 'photos', 'pending-count'],
    queryFn: getPendingPhotoCount,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}
