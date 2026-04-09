import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { PhotoTriageView } from './PhotoTriageView';
import { PendingQueueBanner } from './PendingQueueBanner';
import { FilmStripQueue } from './FilmStripQueue';
import { KeyboardShortcutOverlay } from './KeyboardShortcutOverlay';
import { useAdminPhotoApprovals } from './hooks/useAdminPhotoApprovals';
import { usePhotoDecisionMutation } from './hooks/usePhotoDecisionMutation';
import { REJECTION_REASONS } from './constants';
import type { DecidePhotoBody } from './api';
import type { PhotoApprovalItem, RejectionReasonCode } from '@/lib/zod-schemas';

interface ConflictState {
  photoId: string;
  currentStatus: 'pending' | 'approved' | 'rejected';
}

/**
 * Photo Approval Dashboard page — the full triage workflow composed
 * from the 5b.2 hooks and 5b.3 components.
 *
 * State ownership:
 * - `activeIndex` — which photo in the queue is currently being reviewed.
 *   Clamped on refetch so it stays valid when the queue shrinks. Never
 *   advanced by the decision mutation — the broad-prefix invalidation in
 *   `usePhotoDecisionMutation` removes the decided photo from the list,
 *   so the existing index naturally points at the next photo (D14.2 #2).
 *   Last-item edge case: when the curator decides the final photo of a
 *   multi-item queue, the clamp snaps back to the new last photo (still
 *   pending). When the queue had exactly one item, the clamp lands on 0
 *   and the empty state renders.
 * - `overlayOpen` — cheat sheet visibility. Gates the keyboard layer.
 * - `rejectPickerOpen` — inline reject reason picker visibility. Gated
 *   on `can_decide` here AND inside `PhotoTriageView` (defense in depth).
 * - `conflict` — 409 banner state. When present, the keyboard layer is
 *   disabled until the curator dismisses it.
 */
export function PhotoApprovalPage() {
  const { data, isPending, isError, error } = useAdminPhotoApprovals();
  const mutation = usePhotoDecisionMutation();

  const [activeIndex, setActiveIndex] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [rejectPickerOpen, setRejectPickerOpen] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const photos: PhotoApprovalItem[] = data?.photos ?? [];
  const totalCount = data?.total_count ?? 0;
  const queueLength = photos.length;

  // Clamp activeIndex when the queue shrinks (e.g. after a decision refetch).
  useEffect(() => {
    if (queueLength === 0) {
      setActiveIndex(0);
    } else if (activeIndex >= queueLength) {
      setActiveIndex(queueLength - 1);
    }
  }, [queueLength, activeIndex]);

  // Reset the reject picker when the curator moves to a different photo.
  const activePhoto: PhotoApprovalItem | undefined = photos[activeIndex];
  const activePhotoId = activePhoto?.id;
  useEffect(() => {
    setRejectPickerOpen(false);
  }, [activePhotoId]);

  const canDecide = activePhoto?.can_decide ?? false;
  const keyboardDisabled = overlayOpen || conflict !== null || mutation.isPending;

  const decide = useCallback(
    (body: DecidePhotoBody) => {
      if (!activePhoto) return;
      mutation.mutate(
        { id: activePhoto.id, body },
        {
          onSuccess: (result) => {
            setRejectPickerOpen(false);
            if (result.conflict) {
              setConflict({ photoId: activePhoto.id, currentStatus: result.current_status });
            }
          },
        },
      );
    },
    [activePhoto, mutation],
  );

  const approvePublic = useCallback(() => decide({ status: 'approved' }), [decide]);
  const approveTrainingOnly = useCallback(
    () => decide({ status: 'approved', visibility: 'training_only' }),
    [decide],
  );
  const submitRejection = useCallback(
    ({ code, text }: { code: RejectionReasonCode; text: string | null }) => {
      decide({
        status: 'rejected',
        rejection_reason_code: code,
        ...(text !== null && { rejection_reason_text: text }),
      });
    },
    [decide],
  );

  const openRejectPicker = useCallback(() => {
    if (!canDecide) return;
    setRejectPickerOpen(true);
  }, [canDecide]);

  const goPrev = useCallback(() => {
    setActiveIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setActiveIndex((i) => (queueLength === 0 ? 0 : Math.min(queueLength - 1, i + 1)));
  }, [queueLength]);
  const dismissConflict = useCallback(() => setConflict(null), []);

  const positionLabel = useMemo(
    () => (queueLength === 0 ? '0 of 0' : `${activeIndex + 1} of ${queueLength}`),
    [activeIndex, queueLength],
  );

  // Simple keyboard bindings. R opens the reject reason picker directly
  // (the old R-R chord was a "reject + confirm" gesture from before
  // rejection reasons existed — the reason picker itself now serves as
  // the confirmation step, so the chord is redundant).
  const decideEnabled = !keyboardDisabled && canDecide;
  const navEnabled = !keyboardDisabled && queueLength > 0;

  useHotkeys('a', approvePublic, { enabled: decideEnabled }, [approvePublic, decideEnabled]);
  useHotkeys('t', approveTrainingOnly, { enabled: decideEnabled }, [
    approveTrainingOnly,
    decideEnabled,
  ]);
  useHotkeys(
    'r',
    openRejectPicker,
    { enabled: decideEnabled && !rejectPickerOpen },
    [openRejectPicker, decideEnabled, rejectPickerOpen],
  );

  // Reason hotkeys — only active while the reject picker is open. Bound
  // as a single combined listener so the number of hook calls stays
  // constant across renders. 'Other' is intentionally handled via the
  // free-text input inside the picker, not a hotkey.
  const reasonEnabled = decideEnabled && rejectPickerOpen;
  useHotkeys(
    '1,2,3,4,5',
    (_event, handler) => {
      const pressed = handler.keys?.[0];
      const reason = REJECTION_REASONS.find((r) => r.key === pressed);
      if (reason && reason.code !== 'other') {
        submitRejection({ code: reason.code, text: null });
      }
    },
    { enabled: reasonEnabled },
    [reasonEnabled, submitRejection],
  );

  useHotkeys('s', goPrev, { enabled: navEnabled }, [goPrev, navEnabled]);
  useHotkeys('d', goNext, { enabled: navEnabled }, [goNext, navEnabled]);
  useHotkeys(
    'escape',
    () => {
      if (conflict) {
        setConflict(null);
        return;
      }
      if (rejectPickerOpen) {
        setRejectPickerOpen(false);
        return;
      }
      if (overlayOpen) setOverlayOpen(false);
    },
    { enableOnFormTags: true },
    [conflict, rejectPickerOpen, overlayOpen],
  );
  useHotkeys(
    'shift+/',
    () => setOverlayOpen(true),
    { enabled: !overlayOpen, enableOnFormTags: true },
    [overlayOpen],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Photo Approvals</h1>

      {isPending && <LoadingSpinner className="py-16" />}

      {isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error instanceof Error ? error.message : 'Failed to load pending photos.'}
        </div>
      )}

      {!isPending && !isError && (
        <>
          <PendingQueueBanner totalCount={totalCount} shownCount={queueLength} />

          {conflict && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <div>
                This photo is no longer pending (current status:{' '}
                <strong>{conflict.currentStatus}</strong>). Another curator may have acted on it.
                Refresh to update the queue.
              </div>
              <button
                type="button"
                onClick={dismissConflict}
                className="shrink-0 rounded border border-amber-400 bg-white px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                Dismiss
              </button>
            </div>
          )}

          {activePhoto ? (
            <>
              <PhotoTriageView
                photo={activePhoto}
                positionLabel={positionLabel}
                isMutationPending={mutation.isPending}
                rejectPickerOpen={rejectPickerOpen}
                onApprove={approvePublic}
                onApproveTrainingOnly={approveTrainingOnly}
                onRejectButtonClick={openRejectPicker}
                onRejectSubmit={submitRejection}
                onRejectCancel={() => setRejectPickerOpen(false)}
                onPrev={goPrev}
                onNext={goNext}
                onShowShortcuts={() => setOverlayOpen(true)}
              />
              <FilmStripQueue photos={photos} activeIndex={activeIndex} onSelect={setActiveIndex} />
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 p-10 text-center">
              <h2 className="text-lg font-semibold text-foreground">No pending photos</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;re all caught up. New contributions will appear here.
              </p>
            </div>
          )}
        </>
      )}

      <KeyboardShortcutOverlay open={overlayOpen} onOpenChange={setOverlayOpen} />
    </div>
  );
}
