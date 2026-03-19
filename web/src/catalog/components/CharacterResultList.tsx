import { useCallback, useRef, useEffect } from 'react';
import type { SearchCharacterResult } from '@/lib/zod-schemas';

interface CharacterResultListProps {
  results: SearchCharacterResult[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
}

export function CharacterResultList({ results, selectedSlug, onSelect }: CharacterResultListProps) {
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

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
      if (results.length === 0) return;

      const currentIndex = selectedSlug ? results.findIndex((r) => r.slug === selectedSlug) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
        onSelect(results[nextIndex]?.slug);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
        onSelect(results[prevIndex]?.slug);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(undefined);
      }
    },
    [results, selectedSlug, onSelect]
  );

  const setItemRef = useCallback((slug: string, el: HTMLLIElement | null) => {
    if (el) {
      itemRefs.current.set(slug, el);
    } else {
      itemRefs.current.delete(slug);
    }
  }, []);

  return (
    <ul role="listbox" className="space-y-1" onKeyDown={handleKeyDown} aria-label="Character results">
      {results.map((result, index) => {
        const isSelected = result.slug === selectedSlug;
        return (
          <li
            key={result.id}
            ref={(el) => setItemRef(result.slug, el)}
            tabIndex={isSelected || (!selectedSlug && index === 0) ? 0 : -1}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(result.slug)}
            className={`rounded-md border p-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSelected ? 'ring-2 ring-primary/50 bg-accent' : 'border-border/50 hover:bg-accent/50'
            }`}
          >
            <p className="text-sm font-medium text-foreground">{result.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{result.franchise.name}</p>
          </li>
        );
      })}
    </ul>
  );
}
