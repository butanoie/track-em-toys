import { useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/search';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useSearch } from '@/catalog/hooks/useSearch';
import { ItemList } from '@/catalog/components/ItemList';
import { ItemDetailPanel } from '@/catalog/components/ItemDetailPanel';
import { CharacterResultList } from '@/catalog/components/CharacterResultList';
import { CharacterStubPanel } from '@/catalog/components/CharacterStubPanel';
import { SearchPagination } from '@/catalog/components/SearchPagination';
import type { SearchCharacterResult, SearchItemResult } from '@/lib/zod-schemas';

export function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const q = search.q ?? '';
  const page = search.page ?? 1;

  const { data, isPending } = useSearch(q, page);

  const { characters, items } = useMemo(() => {
    if (!data) return { characters: [], items: [] };
    const chars: SearchCharacterResult[] = [];
    const itms: SearchItemResult[] = [];
    for (const result of data.data) {
      if (result.entity_type === 'character') {
        chars.push(result);
      } else {
        itms.push(result);
      }
    }
    return { characters: chars, items: itms };
  }, [data]);

  const selectedItem = useMemo(() => {
    if (search.selected_type === 'item') {
      return items.find((i) => i.slug === search.selected);
    }
    return undefined;
  }, [items, search.selected, search.selected_type]);

  const selectedCharacter = useMemo(() => {
    if (search.selected_type === 'character') {
      return characters.find((c) => c.slug === search.selected);
    }
    return undefined;
  }, [characters, search.selected, search.selected_type]);

  const selectResult = useCallback(
    (slug: string | undefined, type: 'item' | 'character' | undefined) => {
      void navigate({
        to: '/catalog/search',
        search: (prev) => ({ ...prev, selected: slug, selected_type: type }),
      });
    },
    [navigate]
  );

  const selectItem = useCallback(
    (slug: string | undefined) => selectResult(slug, slug ? 'item' : undefined),
    [selectResult]
  );

  const selectCharacter = useCallback(
    (slug: string | undefined) => selectResult(slug, slug ? 'character' : undefined),
    [selectResult]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      void navigate({
        to: '/catalog/search',
        search: (prev) => ({ ...prev, page: newPage, selected: undefined, selected_type: undefined }),
      });
    },
    [navigate]
  );

  // Empty state: no query
  if (!q) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p aria-live="polite" className="sr-only" />
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Search the Catalog</h2>
          <p className="text-sm text-muted-foreground">Search for characters and items across the catalog.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {data ? `${data.total_count} ${data.total_count === 1 ? 'result' : 'results'} for "${q}"` : 'Searching...'}
          </p>
        </div>

        {isPending && !data && <LoadingSpinner className="py-16" />}

        {data && data.total_count === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">No results for &ldquo;{q}&rdquo;</p>
          </div>
        )}

        {data && data.total_count > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            <div className="min-w-0 space-y-8">
              {characters.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-foreground mb-3">
                    Characters{' '}
                    <span className="text-sm font-normal text-muted-foreground tabular-nums">
                      ({characters.length})
                    </span>
                  </h2>
                  <CharacterResultList
                    results={characters}
                    selectedSlug={search.selected_type === 'character' ? search.selected : undefined}
                    onSelect={selectCharacter}
                  />
                </section>
              )}

              {items.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold text-foreground mb-3">
                    Items{' '}
                    <span className="text-sm font-normal text-muted-foreground tabular-nums">({items.length})</span>
                  </h2>
                  <ItemList
                    items={items}
                    selectedSlug={search.selected_type === 'item' ? search.selected : undefined}
                    onSelect={selectItem}
                    totalCount={items.length}
                  />
                </section>
              )}

              <SearchPagination
                page={page}
                totalCount={data.total_count}
                limit={data.limit}
                onPageChange={handlePageChange}
              />
            </div>

            <div className="hidden lg:block border-l border-border min-h-[400px]">
              {search.selected_type === 'character' ? (
                <CharacterStubPanel character={selectedCharacter} onClose={() => selectCharacter(undefined)} />
              ) : (
                <ItemDetailPanel
                  franchise={selectedItem?.franchise.slug ?? ''}
                  itemSlug={search.selected_type === 'item' ? search.selected : undefined}
                  onClose={() => selectItem(undefined)}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
