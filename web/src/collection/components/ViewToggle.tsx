import { LayoutGrid, List } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CollectionViewMode = 'grid' | 'table';

interface ViewToggleProps {
  view: CollectionViewMode;
  onViewChange: (view: CollectionViewMode) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-input" role="radiogroup" aria-label="View mode">
      <button
        type="button"
        role="radio"
        aria-checked={view === 'grid'}
        aria-label="Card view"
        onClick={() => onViewChange('grid')}
        className={cn(
          'inline-flex items-center justify-center h-8 w-8 rounded-l-md transition-colors',
          view === 'grid'
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={view === 'table'}
        aria-label="Table view"
        onClick={() => onViewChange('table')}
        className={cn(
          'inline-flex items-center justify-center h-8 w-8 rounded-r-md transition-colors',
          view === 'table'
            ? 'bg-accent text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
        )}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
