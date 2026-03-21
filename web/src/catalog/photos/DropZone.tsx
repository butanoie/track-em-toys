import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function DropZone({ onFilesSelected, disabled = false }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleFiles = useCallback(
    (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [onFilesSelected]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (!disabled && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        e.target.value = '';
      }
    },
    [handleFiles]
  );

  return (
    <div
      role="region"
      aria-label="Photo upload drop zone"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'relative rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150',
        disabled && 'opacity-50 pointer-events-none',
        isDragOver
          ? 'border-primary border-solid bg-primary/5'
          : 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/40'
      )}
    >
      <Upload
        className={cn('mx-auto h-8 w-8 mb-3', isDragOver ? 'text-primary' : 'text-muted-foreground')}
        aria-hidden="true"
      />

      {isDragOver ? (
        <p className="text-sm font-medium text-primary">Release to upload</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">Drop photos here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or{' '}
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              select files
            </button>
          </p>
        </>
      )}

      <p id="dropzone-format-hint" className="text-xs text-muted-foreground mt-3">
        JPEG, PNG, WebP, GIF &middot; Max 10 MB
      </p>

      <input
        ref={inputRef}
        id="photo-file-input"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={handleInputChange}
        aria-describedby="dropzone-format-hint"
        disabled={disabled}
      />
    </div>
  );
}
