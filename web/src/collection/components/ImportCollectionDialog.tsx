import { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  CollectionExportPayloadSchema,
  type CollectionExportPayload,
  type CollectionImportResponse,
  type ImportMode,
} from '@/lib/zod-schemas';
import { MAX_EXPORT_VERSION, type ImportPreviewData } from '@/collection/lib/import-types';
import { useCollectionImport } from '@/collection/hooks/useCollectionImport';
import { ImportDropZone } from '@/collection/components/ImportDropZone';
import { ImportPreview } from '@/collection/components/ImportPreview';
import { ImportResultsManifest } from '@/collection/components/ImportResultsManifest';

/** Threshold: if import has fewer than this fraction of existing items, require double confirmation */
const OVERWRITE_SIZE_WARNING_RATIO = 0.5;

type ImportDialogState =
  | { phase: 'idle' }
  | { phase: 'file-selected'; file: File; payload: CollectionExportPayload; preview: ImportPreviewData }
  | { phase: 'importing' }
  | { phase: 'complete'; result: CollectionImportResponse; originalItems: CollectionExportPayload['items'] }
  | { phase: 'error'; errorType: 'invalid-json' | 'bad-version' | 'empty-items' | 'api-error'; message: string };

type ConfirmState =
  | { type: 'none' }
  | { type: 'append'; itemCount: number }
  | { type: 'overwrite'; itemCount: number; currentCount: number }
  | { type: 'overwrite-size-warning'; itemCount: number; currentCount: number };

interface ImportCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentCollectionCount: number;
}

function computePreview(payload: CollectionExportPayload): ImportPreviewData {
  const counts = new Map<string, number>();
  for (const item of payload.items) {
    counts.set(item.franchise_slug, (counts.get(item.franchise_slug) ?? 0) + 1);
  }
  return {
    schemaVersion: payload.version,
    exportedAt: payload.exported_at,
    itemCount: payload.items.length,
    franchiseCounts: Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([slug, count]) => ({ slug, count })),
  };
}

function getDialogTitle(phase: ImportDialogState['phase']): string {
  switch (phase) {
    case 'complete':
      return 'Import Complete';
    case 'importing':
      return 'Importing...';
    default:
      return 'Import Collection';
  }
}

function getDialogDescription(phase: ImportDialogState['phase']): string {
  switch (phase) {
    case 'idle':
      return 'Restore items from a previously exported file';
    case 'file-selected':
      return 'Choose how to import';
    case 'importing':
      return 'Resolving catalog slugs and adding items';
    case 'complete':
      return 'Review the import results below';
    case 'error':
      return 'There was a problem with the import';
  }
}

type ErrorType = Extract<ImportDialogState, { phase: 'error' }>['errorType'];

const ERROR_TITLES: Record<ErrorType, string> = {
  'invalid-json': 'Invalid file format',
  'bad-version': 'Unsupported schema version',
  'empty-items': 'No items to import',
  'api-error': 'Import failed',
};

interface ImportErrorAlertProps {
  errorType: ErrorType;
  message: string;
  onRetry: () => void;
}

function ImportErrorAlert({ errorType, message, onRetry }: ImportErrorAlertProps) {
  const isWarning = errorType === 'empty-items';
  return (
    <div role="alert">
      <div
        className={`rounded-lg border p-4 ${
          isWarning
            ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20'
            : 'border-red-200 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/20'
        }`}
      >
        <p
          className={`text-sm font-medium ${
            isWarning ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'
          }`}
        >
          {ERROR_TITLES[errorType]}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className={`mt-3 text-xs hover:underline font-medium ${
            isWarning ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {errorType === 'api-error' ? 'Try again' : 'Choose a different file'}
        </button>
      </div>
    </div>
  );
}

export function ImportCollectionDialog({ open, onOpenChange, currentCollectionCount }: ImportCollectionDialogProps) {
  const [state, setState] = useState<ImportDialogState>({ phase: 'idle' });
  const [confirm, setConfirm] = useState<ConfirmState>({ type: 'none' });
  const importMutation = useCollectionImport();
  const { reset: resetImportMutation } = importMutation;

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setState({ phase: 'idle' });
      setConfirm({ type: 'none' });
      resetImportMutation();
    }
  }, [open, resetImportMutation]);

  async function handleFileSelect(file: File): Promise<void> {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setState({
          phase: 'error',
          errorType: 'invalid-json',
          message: 'The file could not be parsed as JSON. Please select a valid collection export file.',
        });
        return;
      }

      const parsed = CollectionExportPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        setState({
          phase: 'error',
          errorType: 'invalid-json',
          message: 'Invalid export format — the file does not match the expected collection export structure.',
        });
        return;
      }

      if (parsed.data.version > MAX_EXPORT_VERSION) {
        setState({
          phase: 'error',
          errorType: 'bad-version',
          message: `This file uses schema v${parsed.data.version}, but the app only supports up to v${MAX_EXPORT_VERSION}. You may need to update the app.`,
        });
        return;
      }

      if (parsed.data.items.length === 0) {
        setState({
          phase: 'error',
          errorType: 'empty-items',
          message: 'This export file contains zero collection items.',
        });
        return;
      }

      const preview = computePreview(parsed.data);
      setState({ phase: 'file-selected', file, payload: parsed.data, preview });
    } catch {
      setState({ phase: 'error', errorType: 'invalid-json', message: 'Failed to read the file.' });
    }
  }

  function handleRequestAppend(): void {
    if (state.phase !== 'file-selected') return;
    setConfirm({ type: 'append', itemCount: state.preview.itemCount });
  }

  function handleRequestOverwrite(): void {
    if (state.phase !== 'file-selected') return;
    const importCount = state.preview.itemCount;

    // If the import is significantly smaller than the existing collection, require extra confirmation
    if (currentCollectionCount > 0 && importCount < currentCollectionCount * OVERWRITE_SIZE_WARNING_RATIO) {
      setConfirm({
        type: 'overwrite-size-warning',
        itemCount: importCount,
        currentCount: currentCollectionCount,
      });
    } else {
      setConfirm({
        type: 'overwrite',
        itemCount: importCount,
        currentCount: currentCollectionCount,
      });
    }
  }

  function handleConfirmImport(mode: ImportMode): void {
    if (state.phase !== 'file-selected') return;
    const { payload } = state;
    setConfirm({ type: 'none' });
    setState({ phase: 'importing' });

    importMutation.mutate(
      { data: payload, mode },
      {
        onSuccess: (result) => {
          setState({ phase: 'complete', result, originalItems: payload.items });
        },
        onError: (err) => {
          setState({ phase: 'error', errorType: 'api-error', message: err.message });
        },
      }
    );
  }

  function handleDone(): void {
    onOpenChange(false);
  }

  function handleResetToIdle(): void {
    setState({ phase: 'idle' });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{getDialogTitle(state.phase)}</DialogTitle>
            <DialogDescription>{getDialogDescription(state.phase)}</DialogDescription>
          </DialogHeader>

          {/* Phase: idle */}
          {state.phase === 'idle' && (
            <ImportDropZone
              onFileSelect={(file) => {
                void handleFileSelect(file);
              }}
            />
          )}

          {/* Phase: file-selected */}
          {state.phase === 'file-selected' && (
            <ImportPreview file={state.file} preview={state.preview} onReplaceFile={handleResetToIdle} />
          )}

          {/* Phase: importing */}
          {state.phase === 'importing' && (
            <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
              <Loader2 className="h-10 w-10 mx-auto mb-4 text-amber-600 dark:text-amber-400 animate-spin" />
              <p className="text-sm font-medium text-foreground">Processing items</p>
              <p className="text-xs text-muted-foreground mt-1">Matching franchise and item slugs...</p>
            </div>
          )}

          {/* Phase: complete */}
          {state.phase === 'complete' && (
            <ImportResultsManifest result={state.result} originalItems={state.originalItems} onDone={handleDone} />
          )}

          {/* Phase: error */}
          {state.phase === 'error' && (
            <ImportErrorAlert errorType={state.errorType} message={state.message} onRetry={handleResetToIdle} />
          )}

          {/* Footer — idle and file-selected phases */}
          {(state.phase === 'idle' || state.phase === 'file-selected') && (
            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {state.phase === 'file-selected' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRequestAppend}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Append
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRequestOverwrite}
                    className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Replace
                  </Button>
                </div>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Append confirmation — conditionally rendered so TS narrows confirm type */}
      {confirm.type === 'append' && (
        <AlertDialog open onOpenChange={() => setConfirm({ type: 'none' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Append to collection?</AlertDialogTitle>
              <AlertDialogDescription>
                This will add {confirm.itemCount} items to your existing collection
                {currentCollectionCount > 0 ? ` of ${currentCollectionCount} items` : ''}. Existing entries will not be
                modified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleConfirmImport('append')}>
                Append {confirm.itemCount} items
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Overwrite confirmation */}
      {confirm.type === 'overwrite' && (
        <AlertDialog open onOpenChange={() => setConfirm({ type: 'none' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace entire collection?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {confirm.currentCount} existing items and replace them with {confirm.itemCount}{' '}
                items from the file. Removed items can be restored from the soft-delete archive.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleConfirmImport('overwrite')}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Replace collection
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Overwrite size warning — second confirmation for significantly smaller imports */}
      {confirm.type === 'overwrite-size-warning' && (
        <AlertDialog open onOpenChange={() => setConfirm({ type: 'none' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import is much smaller than your collection</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p>
                    Your collection has <span className="font-semibold">{confirm.currentCount}</span> items, but this
                    import only contains <span className="font-semibold">{confirm.itemCount}</span> items. Replacing
                    your collection will soft-delete {confirm.currentCount - confirm.itemCount} more items than it adds.
                  </p>
                  <p className="mt-2">Are you sure you want to proceed?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleConfirmImport('overwrite')}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Yes, replace collection
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
