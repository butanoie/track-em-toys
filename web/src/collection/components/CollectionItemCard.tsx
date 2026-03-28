import { Eye, Pencil, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildPhotoUrl } from '@/catalog/photos/api';
import { ConditionBadge } from '@/collection/components/ConditionBadge';
import { ItemConditionBadge } from '@/collection/components/ItemConditionBadge';
import { formatRelativeDate } from '@/collection/lib/format-date';
import type { CollectionItem } from '@/lib/zod-schemas';

interface CollectionItemCardProps {
  item: CollectionItem;
  onEdit: (item: CollectionItem) => void;
  onViewCatalog: (franchise: string, slug: string) => void;
}

export function CollectionItemCard({ item, onEdit, onViewCatalog }: CollectionItemCardProps) {
  return (
    <article className="group rounded-lg border bg-card hover:shadow-md hover:border-border/80 transition-all duration-200 overflow-hidden">
      <div className="flex gap-4 p-4">
        <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0 overflow-hidden">
          {item.thumbnail_url ? (
            <img
              src={buildPhotoUrl(item.thumbnail_url)}
              alt=""
              className="w-full h-full object-contain"
              loading="lazy"
            />
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
              <ConditionBadge condition={item.package_condition} />
              <ItemConditionBadge grade={item.item_condition} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onViewCatalog(item.franchise.slug, item.item_slug)}
                aria-label={`View catalog details for ${item.item_name}`}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
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

      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground/60 tabular-nums">Added {formatRelativeDate(item.created_at)}</p>
      </div>
    </article>
  );
}
