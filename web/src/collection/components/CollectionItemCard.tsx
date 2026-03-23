import { Link } from '@tanstack/react-router';
import { Pencil, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildPhotoUrl } from '@/catalog/photos/api';
import { ConditionBadge } from '@/collection/components/ConditionBadge';
import type { CollectionItem } from '@/lib/zod-schemas';

interface CollectionItemCardProps {
  item: CollectionItem;
  onEdit: (item: CollectionItem) => void;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function CollectionItemCard({ item, onEdit }: CollectionItemCardProps) {
  return (
    <article className="group rounded-lg border bg-card hover:shadow-md hover:border-border/80 transition-all duration-200 overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0 overflow-hidden">
          {item.thumbnail_url ? (
            <img src={buildPhotoUrl(item.thumbnail_url)} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-medium text-sm text-foreground truncate">{item.item_name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {item.franchise.name} &middot; {item.toy_line.name}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <ConditionBadge condition={item.condition} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(item)}
                aria-label={`Edit ${item.item_name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {item.notes && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">&ldquo;{item.notes}&rdquo;</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground/60 tabular-nums">Added {formatRelativeDate(item.created_at)}</p>
        <Link
          to="/catalog/$franchise/items/$slug"
          params={{ franchise: item.franchise.slug, slug: item.item_slug }}
          className="text-xs text-primary hover:underline opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
        >
          View in catalog
        </Link>
      </div>
    </article>
  );
}
