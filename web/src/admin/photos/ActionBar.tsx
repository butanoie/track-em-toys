import { Button } from '@/components/ui/button';

interface ActionBarProps {
  /** When false, the curator contributed this photo and cannot decide it. */
  canDecide: boolean;
  /**
   * When false, the contributor chose `training_only` intent, so the
   * plain "Approve" button (which would promote to the public catalog
   * by honoring intent) is disabled. Promotion requires re-consent.
   * The "Approve training only" button remains enabled.
   */
  canApprovePublic: boolean;
  /** True while a decision mutation is in flight for the active photo. */
  isPending: boolean;
  onApprove: () => void;
  onApproveTrainingOnly: () => void;
  onReject: () => void;
  onPrev: () => void;
  onNext: () => void;
  onShowShortcuts: () => void;
}

const SELF_REVIEW_TOOLTIP = 'You contributed this photo — another curator must review it';
const TRAINING_ONLY_TOOLTIP =
  'Contributor chose training-only — promoting to the public catalog would require re-consent';

/**
 * The action bar sits below the hero image. Buttons carry
 * `aria-keyshortcuts` so assistive tech announces the bound shortcut.
 *
 * When `canDecide` is false the three decision buttons render disabled
 * with the tooltip explaining why. Navigation (S/D) and the help
 * shortcut (?) remain enabled — the curator should still be able to
 * skip past their own contributions.
 *
 * When `canApprovePublic` is false (contributor chose training_only),
 * the plain "Approve" button is disabled with an explanatory tooltip.
 * "Approve training only" and "Reject" remain enabled — those are the
 * only valid decisions for a training_only contribution.
 */
export function ActionBar({
  canDecide,
  canApprovePublic,
  isPending,
  onApprove,
  onApproveTrainingOnly,
  onReject,
  onPrev,
  onNext,
  onShowShortcuts,
}: ActionBarProps) {
  const decisionDisabled = !canDecide || isPending;
  const decisionTitle = canDecide ? undefined : SELF_REVIEW_TOOLTIP;
  const approvePublicDisabled = decisionDisabled || !canApprovePublic;
  const approvePublicTitle = !canDecide
    ? SELF_REVIEW_TOOLTIP
    : !canApprovePublic
      ? TRAINING_ONLY_TOOLTIP
      : undefined;

  return (
    <div
      role="toolbar"
      aria-label="Photo decision actions"
      className="flex flex-wrap items-center gap-2"
    >
      <Button
        type="button"
        variant="default"
        aria-keyshortcuts="A"
        onClick={onApprove}
        disabled={approvePublicDisabled}
        title={approvePublicTitle}
      >
        Approve <span className="ml-1 text-xs opacity-70">A</span>
      </Button>
      <Button
        type="button"
        variant="secondary"
        aria-keyshortcuts="T"
        onClick={onApproveTrainingOnly}
        disabled={decisionDisabled}
        title={decisionTitle}
      >
        Approve training only <span className="ml-1 text-xs opacity-70">T</span>
      </Button>
      <Button
        type="button"
        variant="destructive"
        aria-keyshortcuts="R"
        onClick={onReject}
        disabled={decisionDisabled}
        title={decisionTitle}
      >
        Reject <span className="ml-1 text-xs opacity-70">R</span>
      </Button>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          aria-keyshortcuts="S"
          onClick={onPrev}
          disabled={isPending}
        >
          Prev <span className="ml-1 text-xs opacity-70">S</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-keyshortcuts="D"
          onClick={onNext}
          disabled={isPending}
        >
          Next <span className="ml-1 text-xs opacity-70">D</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-keyshortcuts="?"
          aria-label="Show keyboard shortcuts"
          onClick={onShowShortcuts}
        >
          ?
        </Button>
      </div>
    </div>
  );
}
