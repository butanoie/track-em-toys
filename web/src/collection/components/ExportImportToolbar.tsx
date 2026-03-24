import { Download, Upload, Loader2 } from 'lucide-react';

interface ExportImportToolbarProps {
  hasItems: boolean;
  isExporting: boolean;
  onExport: () => void;
  onImportOpen: () => void;
}

export function ExportImportToolbar({ hasItems, isExporting, onExport, onImportOpen }: ExportImportToolbarProps) {
  return (
    <div className="flex items-center border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onExport}
        disabled={!hasItems || isExporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors border-r border-border disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        Export
      </button>
      <button
        type="button"
        onClick={onImportOpen}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </button>
    </div>
  );
}
