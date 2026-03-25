import { Button } from '@/components/ui/button';

type EntityType = 'character' | 'item';

interface SearchResultTypeFilterProps {
  activeType: EntityType | undefined;
  characterCount: number;
  itemCount: number;
  onTypeChange: (type: EntityType | undefined) => void;
}

export function SearchResultTypeFilter({
  activeType,
  characterCount,
  itemCount,
  onTypeChange,
}: SearchResultTypeFilterProps) {
  const totalCount = characterCount + itemCount;

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Filter by result type">
      <Button
        variant={activeType === undefined ? 'default' : 'outline'}
        size="sm"
        className="h-7 text-xs tabular-nums"
        onClick={() => onTypeChange(undefined)}
        aria-pressed={activeType === undefined}
      >
        All · {totalCount}
      </Button>
      {characterCount > 0 && (
        <Button
          variant={activeType === 'character' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs tabular-nums"
          onClick={() => onTypeChange(activeType === 'character' ? undefined : 'character')}
          aria-pressed={activeType === 'character'}
        >
          Characters · {characterCount}
        </Button>
      )}
      {itemCount > 0 && (
        <Button
          variant={activeType === 'item' ? 'default' : 'outline'}
          size="sm"
          className="h-7 text-xs tabular-nums"
          onClick={() => onTypeChange(activeType === 'item' ? undefined : 'item')}
          aria-pressed={activeType === 'item'}
        >
          Items · {itemCount}
        </Button>
      )}
    </div>
  );
}
