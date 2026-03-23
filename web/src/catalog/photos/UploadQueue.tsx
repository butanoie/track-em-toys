import { Circle, CheckCircle2, XCircle, X, Loader2, Paperclip } from 'lucide-react';
import type { UploadItem } from './usePhotoUpload';

interface UploadQueueProps {
  items: UploadItem[];
  onDismiss?: (id: string) => void;
}

export function UploadQueue({ items, onDismiss }: UploadQueueProps) {
  if (items.length === 0) return null;

  return (
    <div aria-label="Upload progress" role="region" aria-live="polite" className="space-y-0.5">
      {items.map((item) => (
        <UploadQueueRow key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function UploadQueueRow({ item, onDismiss }: { item: UploadItem; onDismiss?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <span className="text-sm text-foreground truncate flex-1">{item.fileName}</span>

      {item.status === 'uploading' && (
        <>
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden" role="presentation">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{item.progress}%</span>
          <Loader2
            className="h-3.5 w-3.5 text-primary animate-spin flex-shrink-0"
            aria-label={`Uploading ${item.fileName}`}
          />
        </>
      )}

      {item.status === 'queued' && (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" aria-label="Queued" />
      )}

      {item.status === 'done' && (
        <CheckCircle2
          className="h-3.5 w-3.5 text-green-600 dark:text-green-400 flex-shrink-0"
          aria-label="Upload complete"
        />
      )}

      {item.status === 'error' && (
        <>
          <span className="text-xs text-destructive truncate" role="alert">
            {item.errorMessage ?? 'Upload failed'}
          </span>
          <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" aria-label="Upload failed" />
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="h-4 w-4 flex-shrink-0 rounded-sm hover:bg-muted"
              aria-label={`Dismiss ${item.fileName} error`}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
