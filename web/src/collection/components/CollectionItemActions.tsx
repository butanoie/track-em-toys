import { Camera, Eye, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CollectionItem } from '@/lib/zod-schemas';

interface CollectionItemActionsProps {
  item: CollectionItem;
  onEdit: (item: CollectionItem) => void;
  onViewCatalog: (franchise: string, slug: string) => void;
  onManagePhotos: (item: CollectionItem) => void;
}

/**
 * Action button row shown on every collection item — used by both
 * `CollectionItemCard` (Grid view) and `CollectionTable` (Table view).
 *
 * Includes the View / Edit / Manage Photos buttons. The Manage Photos button
 * shows a photo-count badge when `item.collection_photo_count > 0`. Extracted
 * here so the badge logic, button sizing, and accessible labels can never
 * drift between the Grid and Table render paths.
 */
export function CollectionItemActions({ item, onEdit, onViewCatalog, onManagePhotos }: CollectionItemActionsProps) {
  return (
    <>
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
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 relative"
        onClick={() => onManagePhotos(item)}
        aria-label={`Manage photos for ${item.item_name}`}
      >
        <Camera className="h-3.5 w-3.5" />
        {item.collection_photo_count > 0 && (
          <Badge
            variant="secondary"
            className="absolute -top-1 -right-1 text-[10px] px-1 h-4 min-w-4 flex items-center justify-center"
          >
            {item.collection_photo_count}
          </Badge>
        )}
      </Button>
    </>
  );
}
