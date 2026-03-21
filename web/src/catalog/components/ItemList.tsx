import { useCallback, useRef, useEffect, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
interface ItemListItem {
  id: string;
  slug: string;
  name: string;
  manufacturer: { name: string } | null;
  toy_line: { name: string } | null;
  size_class: string | null;
  year_released: number | null;
}

interface ItemListProps {
  items: ItemListItem[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
  totalCount: number;
  paginationControls?: ReactNode;
}

export function ItemList({ items, selectedSlug, onSelect, totalCount, paginationControls }: ItemListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Focus the selected item when it changes via keyboard
  useEffect(() => {
    if (selectedSlug) {
      const el = itemRefs.current.get(selectedSlug);
      if (el && document.activeElement !== el) {
        el.focus();
      }
    }
  }, [selectedSlug]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;

      const currentIndex = selectedSlug ? items.findIndex((i) => i.slug === selectedSlug) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        onSelect(items[nextIndex]?.slug);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        onSelect(items[prevIndex]?.slug);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(undefined);
      }
    },
    [items, selectedSlug, onSelect]
  );

  const setItemRef = useCallback((slug: string, el: HTMLLIElement | null) => {
    if (el) {
      itemRefs.current.set(slug, el);
    } else {
      itemRefs.current.delete(slug);
    }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </p>
        {paginationControls && <div className="flex items-center gap-2">{paginationControls}</div>}
      </div>
      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No items match your filters.</p>
        </div>
      ) : (
        <ul ref={listRef} role="listbox" className="space-y-1" onKeyDown={handleKeyDown} aria-label="Items">
          {items.map((item) => {
            const isSelected = item.slug === selectedSlug;
            return (
              <li
                key={item.id}
                ref={(el) => setItemRef(item.slug, el)}
                tabIndex={isSelected || (!selectedSlug && items.indexOf(item) === 0) ? 0 : -1}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(item.slug)}
                className={`rounded-md border p-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? 'ring-2 ring-primary/50 bg-accent' : 'border-border/50 hover:bg-accent/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.manufacturer?.name ?? 'Unknown'} · {item.toy_line?.name ?? ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {item.size_class && (
                      <Badge variant="secondary" className="text-xs">
                        {item.size_class}
                      </Badge>
                    )}
                    {item.year_released && (
                      <span className="text-xs text-muted-foreground tabular-nums">{item.year_released}</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
