import { buildPhotoUrl } from '@/lib/photo-url';
import { ActionBar } from './ActionBar';
import { PhotoMetadataPanel } from './PhotoMetadataPanel';
import { RejectReasonPicker } from './RejectReasonPicker';
import type { PhotoApprovalItem, RejectionReasonCode } from '@/lib/zod-schemas';

interface PhotoTriageViewProps {
  photo: PhotoApprovalItem;
  /** 1-indexed position in the queue, used for the visually-hidden live region. */
  positionLabel: string;
  isMutationPending: boolean;
  rejectPickerOpen: boolean;
  /** False when the contributor chose training_only — disables the public approve button. */
  canApprovePublic: boolean;
  onApprove: () => void;
  onApproveTrainingOnly: () => void;
  onRejectButtonClick: () => void;
  onRejectSubmit: (payload: { code: RejectionReasonCode; text: string | null }) => void;
  onRejectCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  onShowShortcuts: () => void;
}

/**
 * Layout container for the single-image triage workflow. Composes the
 * hero image, sidebar metadata panel, action bar, and (conditionally)
 * the inline reject reason picker.
 *
 * The visually-hidden `aria-live="polite"` region announces queue
 * position changes to assistive tech every time `positionLabel` changes
 * — required by the base plan's accessibility section.
 *
 * Self-approval is gated here: when `photo.can_decide` is false the
 * action bar renders disabled buttons (with tooltip) AND the reject
 * picker is suppressed even if `rejectPickerOpen` is true. The latter
 * is defense-in-depth — the page also gates the chord, but a stale
 * `rejectPickerOpen=true` carrying over from a previous photo would
 * otherwise let the user click reasons on a self-contributed photo.
 */
export function PhotoTriageView({
  photo,
  positionLabel,
  isMutationPending,
  rejectPickerOpen,
  canApprovePublic,
  onApprove,
  onApproveTrainingOnly,
  onRejectButtonClick,
  onRejectSubmit,
  onRejectCancel,
  onPrev,
  onNext,
  onShowShortcuts,
}: PhotoTriageViewProps) {
  const showRejectPicker = rejectPickerOpen && photo.can_decide;

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="Photo triage">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Reviewing <span className="text-muted-foreground">{photo.item.name}</span>
        </h2>

        {/* visually-hidden live region */}
        <div aria-live="polite" className="sr-only">
          Reviewing photo {positionLabel}
        </div>

        <div className="overflow-hidden rounded-md border border-border bg-muted/30">
          <img
            src={buildPhotoUrl(photo.photo.url)}
            alt={photo.photo.caption ?? `Pending photo for ${photo.item.name}`}
            className="mx-auto max-h-[32rem] w-full object-contain"
          />
        </div>

        {photo.photo.caption && (
          <p className="text-sm italic text-muted-foreground">“{photo.photo.caption}”</p>
        )}

        <ActionBar
          canDecide={photo.can_decide}
          canApprovePublic={canApprovePublic}
          isPending={isMutationPending}
          onApprove={onApprove}
          onApproveTrainingOnly={onApproveTrainingOnly}
          onReject={onRejectButtonClick}
          onPrev={onPrev}
          onNext={onNext}
          onShowShortcuts={onShowShortcuts}
        />

        {showRejectPicker && (
          <RejectReasonPicker
            isPending={isMutationPending}
            onSubmit={onRejectSubmit}
            onCancel={onRejectCancel}
          />
        )}
      </div>

      <PhotoMetadataPanel photo={photo} />
    </section>
  );
}
