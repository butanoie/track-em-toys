import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Route } from '@/routes/_authenticated/catalog/search';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';
import { useSearch, type SearchEntityType } from '@/catalog/hooks/useSearch';
import { exportForMl } from '@/catalog/api';
import { SearchResultCard } from '@/catalog/components/SearchResultCard';
import { SearchResultTypeFilter } from '@/catalog/components/SearchResultTypeFilter';
import { ItemDetailSheet } from '@/catalog/components/ItemDetailSheet';
import { CharacterDetailSheet } from '@/catalog/components/CharacterDetailSheet';
import { Pagination } from '@/catalog/components/Pagination';
import { PageSizeSelector } from '@/components/PageSizeSelector';
import { DEFAULT_PAGE_LIMIT, type PageLimitOption } from '@/lib/pagination-constants';

export function SearchPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const q = search.q ?? '';
  const page = search.page ?? 1;
  const limit = search.limit ?? DEFAULT_PAGE_LIMIT;
  const activeType = search.type;

  const { data, isPending } = useSearch(q, page, undefined, limit, activeType);

  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const selectedSlug = search.selected;
  const selectedType = search.selected_type;

  useEffect(() => {
    if (selectedSlug && selectedType) {
      const el = itemRefs.current.get(`${selectedType}-${selectedSlug}`);
      if (el && document.activeElement !== el) {
        el.focus();
      }
    }
  }, [selectedSlug, selectedType]);

  const exportMutation = useMutation({
    mutationFn: () => exportForMl({ q }),
    onSuccess: (result) => {
      toast.success(
        `Export complete — ${result.stats.total_photos} photos, ${result.stats.items} items → ${result.filename}`
      );
    },
    onError: () => {
      toast.error('ML export failed. Check server logs.');
    },
  });

  const selectResult = useCallback(
    (slug: string | undefined, type: 'item' | 'character' | undefined) => {
      void navigate({
        to: '/catalog/search',
        search: (prev) => ({ ...prev, selected: slug, selected_type: type }),
      });
    },
    [navigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!data || data.data.length === 0) return;
      const results = data.data;
      const currentIndex = selectedSlug ? results.findIndex((r) => r.slug === selectedSlug) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0;
        const next = results[nextIndex];
        if (next) selectResult(next.slug, next.entity_type);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1;
        const prev = results[prevIndex];
        if (prev) selectResult(prev.slug, prev.entity_type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        selectResult(undefined, undefined);
      }
    },
    [data, selectedSlug, selectResult]
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

  const handleLimitChange = useCallback(
    (newLimit: PageLimitOption) => {
      void navigate({
        to: '/catalog/search',
        search: (prev) => {
          const next = {
            ...prev,
            limit: newLimit === DEFAULT_PAGE_LIMIT ? undefined : newLimit,
            page: undefined,
            selected: undefined,
            selected_type: undefined,
          };
          for (const [k, v] of Object.entries(next)) {
            if (v === undefined) delete (next as Record<string, unknown>)[k];
          }
          return next;
        },
      });
    },
    [navigate]
  );

  const handleTypeChange = useCallback(
    (type: SearchEntityType | undefined) => {
      void navigate({
        to: '/catalog/search',
        search: (prev) => {
          const next = { ...prev, type, page: undefined, selected: undefined, selected_type: undefined };
          for (const [k, v] of Object.entries(next)) {
            if (v === undefined) delete (next as Record<string, unknown>)[k];
          }
          return next;
        },
      });
    },
    [navigate]
  );

  const setItemRef = useCallback((key: string, el: HTMLLIElement | null) => {
    if (el) {
      itemRefs.current.set(key, el);
    } else {
      itemRefs.current.delete(key);
    }
  }, []);

  // Derive selected result for the detail sheet
  const selectedResult = data?.data.find((r) => r.slug === selectedSlug);

  // Empty state: no query
  if (!q) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p aria-live="polite" className="sr-only" />
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Search the Catalog</h1>
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
        {/* Top bar: result count, type filter, controls */}
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {data
                ? `${data.total_count} ${data.total_count === 1 ? 'result' : 'results'} for "${q}"`
                : 'Searching...'}
            </p>
            {data && (data.character_count > 0 || data.item_count > 0) && (
              <SearchResultTypeFilter
                activeType={activeType}
                characterCount={data.character_count}
                itemCount={data.item_count}
                onTypeChange={handleTypeChange}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && data && data.item_count > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void exportMutation.mutate();
                }}
                disabled={exportMutation.isPending}
              >
                <Download className="h-4 w-4 mr-1.5" />
                {exportMutation.isPending ? 'Exporting...' : 'Export for ML'}
              </Button>
            )}
            {data && data.total_count > 0 && <PageSizeSelector value={limit} onChange={handleLimitChange} />}
          </div>
        </div>

        {isPending && !data && <LoadingSpinner className="py-16" />}

        {data && data.total_count === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm">
              No {activeType ? `${activeType}s` : 'results'} for &ldquo;{q}&rdquo;
            </p>
          </div>
        )}

        {data && data.total_count > 0 && (
          <div className="min-w-0">
            <ul role="listbox" className="space-y-1" onKeyDown={handleKeyDown} aria-label="Search results">
              {data.data.map((result, index) => {
                const isSelected = result.slug === selectedSlug && result.entity_type === selectedType;
                return (
                  <li
                    key={`${result.entity_type}-${result.id}`}
                    ref={(el) => setItemRef(`${result.entity_type}-${result.slug}`, el)}
                    tabIndex={isSelected || (!selectedSlug && index === 0) ? 0 : -1}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => selectResult(result.slug, result.entity_type)}
                  >
                    <SearchResultCard result={result} isSelected={isSelected} />
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={page}
              totalCount={data.total_count}
              limit={data.limit}
              onPageChange={handlePageChange}
              ariaLabel="Search results pagination"
            />
          </div>
        )}

        <ItemDetailSheet
          franchise={selectedResult?.franchise.slug ?? ''}
          itemSlug={selectedType === 'item' ? selectedSlug : undefined}
          onClose={() => selectResult(undefined, undefined)}
        />
        <CharacterDetailSheet
          franchise={selectedResult?.franchise.slug ?? ''}
          characterSlug={selectedType === 'character' ? selectedSlug : undefined}
          onClose={() => selectResult(undefined, undefined)}
        />
      </main>
    </div>
  );
}
