import { Eye, Pencil, Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { buildPhotoUrl } from '@/catalog/photos/api';
import { ConditionBadge } from '@/collection/components/ConditionBadge';
import { ItemConditionBadge } from '@/collection/components/ItemConditionBadge';
import { formatRelativeDate } from '@/collection/lib/format-date';
import type { CollectionItem } from '@/lib/zod-schemas';

interface CollectionTableProps {
  items: CollectionItem[];
  isLoading: boolean;
  onEdit: (item: CollectionItem) => void;
  onViewCatalog: (franchise: string, slug: string) => void;
}

export function CollectionTable({ items, isLoading, onEdit, onViewCatalog }: CollectionTableProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Toy Line</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={6}>
                  <div className="h-6 bg-muted animate-pulse rounded" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="hidden md:table-cell">Toy Line</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                No items match your filters.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="hidden md:table-cell">Toy Line</TableHead>
            <TableHead>Condition</TableHead>
            <TableHead className="hidden md:table-cell">Notes</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-muted flex-shrink-0 overflow-hidden">
                    {item.thumbnail_url ? (
                      <img
                        src={buildPhotoUrl(item.thumbnail_url)}
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
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">{item.franchise.name}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{item.toy_line.name}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <ConditionBadge condition={item.package_condition} />
                  <ItemConditionBadge grade={item.item_condition} />
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-48 truncate">
                {item.notes ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {formatRelativeDate(item.created_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
