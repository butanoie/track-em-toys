import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  CollectionExportPayloadSchema,
  type CollectionExportPayload,
  type CollectionImportResponse,
} from '@/lib/zod-schemas';
import { MAX_EXPORT_VERSION, type ImportPreviewData } from '@/collection/lib/import-types';
import { useCollectionImport } from '@/collection/hooks/useCollectionImport';
import { ImportDropZone } from '@/collection/components/ImportDropZone';
import { ImportPreview } from '@/collection/components/ImportPreview';
import { ImportResultsManifest } from '@/collection/components/ImportResultsManifest';

type ImportDialogState =
  | { phase: 'idle' }
  | { phase: 'file-selected'; file: File; payload: CollectionExportPayload; preview: ImportPreviewData }
  | { phase: 'importing' }
  | { phase: 'complete'; result: CollectionImportResponse; originalItems: CollectionExportPayload['items'] }
  | { phase: 'error'; errorType: 'invalid-json' | 'bad-version' | 'empty-items' | 'api-error'; message: string };

interface ImportCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      return 'Review before importing';
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

export function ImportCollectionDialog({ open, onOpenChange }: ImportCollectionDialogProps) {
  const [state, setState] = useState<ImportDialogState>({ phase: 'idle' });
  const importMutation = useCollectionImport();
  const { reset: resetImportMutation } = importMutation;

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setState({ phase: 'idle' });
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

  function handleConfirmImport(): void {
    if (state.phase !== 'file-selected') return;
    const { payload } = state;
    setState({ phase: 'importing' });

    importMutation.mutate(payload, {
      onSuccess: (result) => {
        setState({ phase: 'complete', result, originalItems: payload.items });
      },
      onError: (err) => {
        setState({ phase: 'error', errorType: 'api-error', message: err.message });
      },
    });
  }

  function handleDone(): void {
    onOpenChange(false);
  }

  function handleResetToIdle(): void {
    setState({ phase: 'idle' });
  }

  return (
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

        {/* Footer — only for idle and file-selected phases */}
        {(state.phase === 'idle' || state.phase === 'file-selected') && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmImport}
              disabled={state.phase !== 'file-selected'}
              className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              {state.phase === 'file-selected' ? `Import ${state.preview.itemCount} items` : 'Import'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
