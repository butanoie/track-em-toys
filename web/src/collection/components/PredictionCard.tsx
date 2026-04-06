import { useCallback, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { useCollectionCheck } from '@/collection/hooks/useCollectionCheck';
import { AddToCollectionDialog } from '@/collection/components/AddToCollectionDialog';
import { formatSlugAsName } from '@/ml/label-parser';
import { emitMlEvent } from '@/ml/telemetry';
import type { Prediction } from '@/ml/types';
import type { MlModelSummary } from '@/lib/zod-schemas';
import type { CollectionMutations } from '@/collection/hooks/useCollectionMutations';

/**
 * Return bar + text color classes based on confidence level.
 * Colors meet WCAG 2.2 AA contrast ratios:
 * - Text (4.5:1): green-700/green-400, amber-700/amber-400, red-700/red-400
 * - Bar (3:1 as UI component): green-600/green-500, amber-500/amber-400, red-600/red-500
 */
function confidenceColors(confidence: number): { bar: string; text: string } {
  if (confidence >= 0.5) {
    return {
      bar: 'bg-green-600 dark:bg-green-500',
      text: 'text-green-700 dark:text-green-400',
    };
  }
  if (confidence >= 0.15) {
    return {
      bar: 'bg-amber-500 dark:bg-amber-400',
      text: 'text-amber-700 dark:text-amber-400',
    };
  }
  return {
    bar: 'bg-red-600 dark:bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  };
}

interface PredictionCardProps {
  prediction: Prediction;
  predictionRank: number;
  activeModel: MlModelSummary | undefined;
  mutations: CollectionMutations;
  onAccepted?: () => void;
  photoFile?: File;
}

export function PredictionCard({
  prediction,
  predictionRank,
  activeModel,
  mutations,
  onAccepted,
  photoFile,
}: PredictionCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { franchiseSlug, itemSlug, confidence } = prediction;

  // Eagerly fetch item detail (small JSON, cached by TanStack Query)
  const { data: itemDetail } = useItemDetail(franchiseSlug, itemSlug);

  const itemIds = useMemo(() => (itemDetail ? [itemDetail.id] : []), [itemDetail]);
  const { data: checkData } = useCollectionCheck(itemIds);
  const checkResult = itemDetail ? checkData?.items[itemDetail.id] : undefined;
  const alreadyOwned = (checkResult?.count ?? 0) > 0;

  const displayName = itemDetail?.name ?? formatSlugAsName(itemSlug);
  const percent = (confidence * 100).toFixed(1);

  const manufacturer = itemDetail?.manufacturer?.name;
  const toyLine = itemDetail?.toy_line?.name;
  const productCode = itemDetail?.product_code;
  const franchise = itemDetail?.franchise?.name ?? formatSlugAsName(franchiseSlug);

  const details = [franchise, manufacturer, toyLine].filter(Boolean).join(', ');

  const handleAddSuccess = useCallback(() => {
    emitMlEvent('prediction_accepted', activeModel?.name, {
      model_version: activeModel?.version,
      model_category: activeModel?.category,
      accepted_label: prediction.label,
      accepted_rank: predictionRank,
      accepted_confidence: confidence,
      item_id: itemDetail?.id,
    });
    onAccepted?.();
  }, [activeModel, prediction.label, predictionRank, confidence, itemDetail, onAccepted]);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-1.5">
          <Link
            to="/catalog/$franchise/items/$slug"
            params={{ franchise: franchiseSlug, slug: itemSlug }}
            className="text-sm font-medium text-foreground hover:underline truncate"
          >
            {displayName}
          </Link>
          {productCode && <span className="text-xs text-muted-foreground shrink-0">[{productCode}]</span>}
          {alreadyOwned && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Owned
            </Badge>
          )}
        </div>

        {details && <p className="text-xs text-muted-foreground truncate">{details}</p>}

        {/* Confidence bar — color-coded: green ≥50%, amber ≥15%, red <15% */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${confidenceColors(confidence).bar}`}
              style={{ width: `${Math.min(confidence * 100, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-medium tabular-nums w-12 text-right ${confidenceColors(confidence).text}`}>
            {percent}%
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
        disabled={!itemDetail}
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Add
      </Button>

      {itemDetail && (
        <AddToCollectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          itemId={itemDetail.id}
          itemName={itemDetail.name}
          alreadyOwned={alreadyOwned}
          mutations={mutations}
          onSuccess={handleAddSuccess}
          photoFile={photoFile}
        />
      )}
    </div>
  );
}
