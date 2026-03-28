import { Package, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buildPhotoUrl } from '@/catalog/photos/api';
import type { SearchResult } from '@/lib/zod-schemas';

interface SearchResultCardProps {
  result: SearchResult;
  isSelected: boolean;
}

export function SearchResultCard({ result, isSelected }: SearchResultCardProps) {
  const shared = 'rounded-md border p-3 transition-colors';
  const isCharacter = result.entity_type === 'character';

  const stateClass = isSelected
    ? 'ring-2 ring-primary/50 bg-accent'
    : isCharacter
      ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-100/50 dark:hover:bg-indigo-950/40'
      : 'border-border/50 hover:bg-accent/50';

  const className = `${shared} ${stateClass}`;

  if (isCharacter) {
    return (
      <div className={className}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-muted flex-shrink-0 flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground/40" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{result.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.franchise.name}
              {result.continuity_family && ` · ${result.continuity_family.name}`}
            </p>
          </div>
          <Badge variant="outline" className="text-xs flex-shrink-0">
            Character
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded bg-muted flex-shrink-0 overflow-hidden">
          {result.thumbnail_url ? (
            <img
              src={buildPhotoUrl(result.thumbnail_url)}
              alt=""
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-4 w-4 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {result.product_code ? `${result.name} [${result.product_code}]` : result.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {result.franchise.name}
            {result.manufacturer && ` · ${result.manufacturer.name}`}
            {result.toy_line && ` · ${result.toy_line.name}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant="outline" className="text-xs">
            Item
          </Badge>
          {result.size_class && (
            <Badge variant="secondary" className="text-xs">
              {result.size_class}
            </Badge>
          )}
          {result.year_released && (
            <span className="text-xs text-muted-foreground tabular-nums">{result.year_released}</span>
          )}
        </div>
      </div>
    </div>
  );
}
