import { Check, X, Download, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConditionBadge } from '@/collection/components/ConditionBadge';
import { downloadJsonBlob } from '@/collection/lib/download';
import type { CollectionImportResponse, CollectionExportPayload, UnresolvedItem } from '@/lib/zod-schemas';

interface ImportResultsManifestProps {
  result: CollectionImportResponse;
  originalItems?: CollectionExportPayload['items'];
  onDone: () => void;
}

function handleDownloadRetry(unresolved: UnresolvedItem[], originalItems: CollectionExportPayload['items']): void {
  const failedSlugs = new Set(unresolved.map((u) => `${u.franchise_slug}::${u.item_slug}`));
  const retryItems = originalItems.filter((item) => failedSlugs.has(`${item.franchise_slug}::${item.item_slug}`));
  const payload: CollectionExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    items: retryItems,
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadJsonBlob(JSON.stringify(payload, null, 2), `collection-import-retry-${date}.json`);
}

export function ImportResultsManifest({ result, originalItems, onDone }: ImportResultsManifestProps) {
  const { imported, unresolved } = result;
  const allSuccess = unresolved.length === 0;

  if (allSuccess) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-lg font-semibold text-foreground">All items imported</p>
          <p className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {imported.length}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {imported.length === 1 ? 'item' : 'items'} added to your collection
          </p>
          {result.overwritten_count > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {result.overwritten_count} previous {result.overwritten_count === 1 ? 'item was' : 'items were'} archived
            </p>
          )}
        </div>
        <div className="flex items-center justify-end">
          <Button
            onClick={onDone}
            className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Summary counters */}
      <div className="flex items-center gap-4 mb-4" aria-live="polite">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {imported.length}
          </span>
          <span className="text-xs text-emerald-600 dark:text-emerald-400">imported</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60">
          <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400" />
          <span className="text-sm font-bold tabular-nums text-red-600 dark:text-red-400">{unresolved.length}</span>
          <span className="text-xs text-red-500 dark:text-red-400">unresolved</span>
        </div>
      </div>

      {/* Manifest list */}
      <div
        className="max-h-[360px] overflow-y-auto rounded-lg border border-border"
        tabIndex={0}
        aria-label="Import results"
      >
        {/* Unresolved section */}
        <div className="px-4 py-2 bg-red-50/50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900/30">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Unresolved</p>
        </div>
        {unresolved.map((item, i) => (
          <div
            key={`unresolved-${item.franchise_slug}-${item.item_slug}-${i}`}
            className="px-4 py-3 flex items-center gap-3 bg-red-50/30 dark:bg-red-950/10 border-b border-border last:border-b-0"
          >
            <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <X className="h-3 w-3 text-red-500 dark:text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-red-500 dark:text-red-400">
                {item.franchise_slug} / {item.item_slug}
              </p>
            </div>
            <span className="text-xs text-red-500 dark:text-red-400 flex-shrink-0">{item.reason}</span>
          </div>
        ))}

        {/* Imported section */}
        {imported.length > 0 && (
          <>
            <div className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30 border-t border-t-border">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Imported
              </p>
            </div>
            {imported.map((item, i) => (
              <div
                key={`imported-${item.franchise_slug}-${item.item_slug}-${i}`}
                className="px-4 py-3 flex items-center gap-3 border-b border-border last:border-b-0"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.item_name}</p>
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">
                    {item.franchise_slug} / {item.item_slug}
                  </p>
                </div>
                <ConditionBadge condition={item.condition} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        {originalItems && unresolved.length > 0 ? (
          <button
            type="button"
            onClick={() => handleDownloadRetry(unresolved, originalItems)}
            className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
          >
            <Download className="h-3 w-3" />
            Download failed items
          </button>
        ) : (
          <span />
        )}
        <Button
          onClick={onDone}
          className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          Done
        </Button>
      </div>
    </div>
  );
}
