import { Package } from 'lucide-react';
import { CollectionItemCard } from '@/collection/components/CollectionItemCard';
import type { CollectionItem } from '@/lib/zod-schemas';

interface CollectionGridProps {
  items: CollectionItem[];
  isLoading: boolean;
  onEdit: (item: CollectionItem) => void;
  onViewCatalog: (franchise: string, slug: string) => void;
  onManagePhotos: (item: CollectionItem) => void;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-card p-4 animate-pulse">
      <div className="flex gap-4">
        <div className="w-20 h-20 rounded-md bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
          <div className="h-3 bg-muted rounded w-1/4 mt-4" />
        </div>
      </div>
    </div>
  );
}

export function CollectionGrid({ items, isLoading, onEdit, onViewCatalog, onManagePhotos }: CollectionGridProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No items match your filters.</p>
      </div>
    );
  }

  return (
    <ul role="list" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((item) => (
        <li key={item.id}>
          <CollectionItemCard
            item={item}
            onEdit={onEdit}
            onViewCatalog={onViewCatalog}
            onManagePhotos={onManagePhotos}
          />
        </li>
      ))}
    </ul>
  );
}
