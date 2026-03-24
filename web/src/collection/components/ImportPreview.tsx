import { FileJson, Archive, Info } from 'lucide-react';
import type { ImportPreviewData } from '@/collection/lib/import-types';

interface ImportPreviewProps {
  file: File;
  preview: ImportPreviewData;
  onReplaceFile: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ImportPreview({ file, preview, onReplaceFile }: ImportPreviewProps) {
  return (
    <div className="space-y-4">
      {/* Selected file chip */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/60 border border-border">
        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center flex-shrink-0">
          <FileJson className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground font-mono truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>
        <button
          type="button"
          onClick={onReplaceFile}
          className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium flex-shrink-0"
        >
          Replace
        </button>
      </div>

      {/* Manifest summary card */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-amber-200/60 dark:border-amber-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-amber-200/60 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 font-medium">
              v{preview.schemaVersion}
            </span>
            <span className="text-xs text-muted-foreground">Schema version</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Exported{' '}
            <span className="font-medium text-foreground">
              {new Date(preview.exportedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </span>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-2xl font-bold tabular-nums text-foreground">{preview.itemCount}</span>
              <span className="text-xs text-muted-foreground">{preview.itemCount === 1 ? 'item' : 'items'}</span>
            </div>
            {preview.franchiseCounts.length > 0 && (
              <>
                <div className="h-6 w-px bg-amber-200 dark:bg-amber-800/60" />
                <div className="flex flex-wrap gap-1.5">
                  {preview.franchiseCounts.map((f) => (
                    <span
                      key={f.slug}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200/60 dark:bg-amber-800/40 text-xs font-medium text-amber-700 dark:text-amber-300"
                    >
                      {f.slug}
                      <span className="tabular-nums">{f.count}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/40">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Items are matched by catalog slug. If a catalog item no longer exists, it will be reported as unresolved.
          Importing adds new collection entries — existing items are not modified.
        </p>
      </div>
    </div>
  );
}
