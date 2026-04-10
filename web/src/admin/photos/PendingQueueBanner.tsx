interface PendingQueueBannerProps {
  totalCount: number;
  shownCount: number;
}

/**
 * Inline informational banner shown above the triage view when the
 * pending queue exceeds the API's 200-row cap. Per D5, this banner has
 * NO dismiss action — dismissing then forgetting about 1000+ items is
 * the failure mode the warning exists to prevent.
 *
 * Renders nothing when `totalCount <= shownCount`.
 */
export function PendingQueueBanner({ totalCount, shownCount }: PendingQueueBannerProps) {
  if (totalCount <= shownCount) {
    return null;
  }
  return (
    <div
      role="status"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      Showing oldest {shownCount} of {totalCount} pending photos. Refresh after clearing this batch
      to see more.
    </div>
  );
}
