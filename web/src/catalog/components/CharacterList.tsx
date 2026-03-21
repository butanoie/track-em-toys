import { useCallback, useRef, useEffect, type ReactNode } from 'react';
import type { CharacterListItem } from '@/lib/zod-schemas';

interface CharacterListProps {
  characters: CharacterListItem[];
  selectedSlug: string | undefined;
  onSelect: (slug: string | undefined) => void;
  totalCount: number;
  paginationControls?: ReactNode;
}

export function CharacterList({
  characters,
  selectedSlug,
  onSelect,
  totalCount,
  paginationControls,
}: CharacterListProps) {
  const listRef = useRef<HTMLUListElement>(null);
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
      if (characters.length === 0) return;

      const currentIndex = selectedSlug ? characters.findIndex((c) => c.slug === selectedSlug) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < characters.length - 1 ? currentIndex + 1 : 0;
        onSelect(characters[nextIndex]?.slug);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : characters.length - 1;
        onSelect(characters[prevIndex]?.slug);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(undefined);
      }
    },
    [characters, selectedSlug, onSelect]
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
          {totalCount} {totalCount === 1 ? 'character' : 'characters'}
        </p>
        {paginationControls && <div className="flex items-center gap-2">{paginationControls}</div>}
      </div>
      {characters.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No characters match your filters.</p>
        </div>
      ) : (
        <ul ref={listRef} role="listbox" className="space-y-1" onKeyDown={handleKeyDown} aria-label="Characters">
          {characters.map((char) => {
            const isSelected = char.slug === selectedSlug;
            return (
              <li
                key={char.id}
                ref={(el) => setItemRef(char.slug, el)}
                tabIndex={isSelected || (!selectedSlug && characters.indexOf(char) === 0) ? 0 : -1}
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(char.slug)}
                className={`rounded-md border p-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? 'ring-2 ring-primary/50 bg-accent' : 'border-border/50 hover:bg-accent/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{char.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {char.continuity_family.name} · {char.faction?.name ?? 'No faction'} · {char.character_type ?? '—'}
                    </p>
                  </div>
                  {char.alt_mode && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">{char.alt_mode}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
