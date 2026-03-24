import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, Upload } from 'lucide-react';
import { Route } from '@/routes/_authenticated/collection';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { useLocalStorage } from '@/lib/use-local-storage';
import { useCollectionItems } from '@/collection/hooks/useCollectionItems';
import { useCollectionStats } from '@/collection/hooks/useCollectionStats';
import { useCollectionMutations } from '@/collection/hooks/useCollectionMutations';
import { useCollectionExport } from '@/collection/hooks/useCollectionExport';
import { CollectionStatsBar } from '@/collection/components/CollectionStatsBar';
import { CollectionFilters } from '@/collection/components/CollectionFilters';
import { CollectionGrid } from '@/collection/components/CollectionGrid';
import { CollectionTable } from '@/collection/components/CollectionTable';
import { ViewToggle, type CollectionViewMode } from '@/collection/components/ViewToggle';
import { ExportImportToolbar } from '@/collection/components/ExportImportToolbar';
import { EditCollectionItemDialog } from '@/collection/components/EditCollectionItemDialog';
import { ImportCollectionDialog } from '@/collection/components/ImportCollectionDialog';
import type { CollectionFilters as CollectionFiltersType } from '@/collection/api';
import type { CollectionItem } from '@/lib/zod-schemas';

export function CollectionPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mutations = useCollectionMutations();
  const { runExport, isExporting } = useCollectionExport();
  const [editTarget, setEditTarget] = useState<CollectionItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useLocalStorage<CollectionViewMode>('trackem:collection-view', 'grid');

  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([]);

  const filters: CollectionFiltersType = useMemo(
    () => ({
      franchise: search.franchise,
      condition: search.condition,
      search: search.search,
      cursor: search.cursor,
    }),
    [search.franchise, search.condition, search.search, search.cursor]
  );

  const { data, isPending } = useCollectionItems(filters);
  const { data: stats } = useCollectionStats();

  const updateSearch = useCallback(
    (updates: Record<string, string | undefined>) => {
      setCursorStack([]);
      void navigate({
        to: '/collection',
        search: (prev) => {
          const next = { ...prev, ...updates, cursor: undefined };
          for (const [k, v] of Object.entries(next)) {
            if (v === undefined || v === '') {
              delete (next as Record<string, unknown>)[k];
            }
          }
          return next;
        },
      });
    },
    [navigate]
  );

  const loadNextPage = useCallback(() => {
    if (data?.next_cursor) {
      setCursorStack((prev) => [...prev, search.cursor]);
      void navigate({
        to: '/collection',
        search: (prev) => ({ ...prev, cursor: data.next_cursor ?? undefined }),
      });
    }
  }, [navigate, data?.next_cursor, search.cursor]);

  const loadPreviousPage = useCallback(() => {
    if (cursorStack.length > 0) {
      const previousCursor = cursorStack[cursorStack.length - 1];
      setCursorStack((prev) => prev.slice(0, -1));
      void navigate({
        to: '/collection',
        search: (prev) => {
          const next = { ...prev, cursor: previousCursor };
          if (!previousCursor) delete (next as Record<string, unknown>).cursor;
          return next;
        },
      });
    }
  }, [navigate, cursorStack]);

  const showEmptyState =
    !isPending && data && data.total_count === 0 && !search.franchise && !search.condition && !search.search;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-2xl font-bold text-foreground mb-6">My Collection</h1>

        {showEmptyState ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
              <svg
                className="h-10 w-10 text-amber-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground">Your collection is empty</h2>
            <p className="mt-2 text-muted-foreground max-w-sm mx-auto">
              Start building your collection by browsing the catalog and adding items you own.
            </p>
            <Link to="/catalog" className="inline-block mt-6">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600">
                Browse Catalog
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300 hover:underline"
              >
                <Upload className="h-3.5 w-3.5" />
                or Import from file
              </button>
            </div>
          </div>
        ) : (
          <>
            <CollectionStatsBar
              stats={stats}
              activeFranchise={search.franchise}
              onFranchiseClick={(slug) => updateSearch({ franchise: slug })}
            />

            <CollectionFilters
              franchise={search.franchise}
              condition={search.condition}
              search={search.search}
              stats={stats}
              onFranchiseChange={(v) => updateSearch({ franchise: v })}
              onConditionChange={(v) => updateSearch({ condition: v })}
              onSearchChange={(v) => updateSearch({ search: v })}
            />

            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
                {data?.total_count ?? '—'} {data?.total_count === 1 ? 'item' : 'items'}
              </p>
              <div className="flex items-center gap-3">
                <ExportImportToolbar
                  hasItems={(stats?.total_copies ?? 0) > 0}
                  isExporting={isExporting}
                  onExport={() => {
                    void runExport();
                  }}
                  onImportOpen={() => setImportOpen(true)}
                />
                <ViewToggle view={view} onViewChange={setView} />
                {(cursorStack.length > 0 || data?.next_cursor) && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadPreviousPage} disabled={cursorStack.length === 0}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadNextPage} disabled={!data?.next_cursor}>
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {view === 'grid' ? (
              <CollectionGrid items={data?.data ?? []} isLoading={isPending} onEdit={setEditTarget} />
            ) : (
              <CollectionTable items={data?.data ?? []} isLoading={isPending} onEdit={setEditTarget} />
            )}
          </>
        )}
      </main>

      <EditCollectionItemDialog
        open={editTarget !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditTarget(null);
        }}
        item={editTarget}
        mutations={mutations}
      />

      <ImportCollectionDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
