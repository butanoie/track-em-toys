import { useRef, useState } from 'react';
import { Archive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImportDropZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function ImportDropZone({ onFileSelect, disabled }: ImportDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const acceptFile = (file: File) => {
    if (file.name.endsWith('.json') || file.type === 'application/json') {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) acceptFile(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Select export file to import"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer group',
        isDragOver
          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
          : 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center group-hover:scale-105 transition-transform">
        <Archive className="h-7 w-7 text-amber-600 dark:text-amber-400" />
      </div>
      <p className="text-sm font-medium text-foreground">Drop your export file here</p>
      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
      <p className="text-xs text-muted-foreground mt-3 font-mono">.json</p>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
