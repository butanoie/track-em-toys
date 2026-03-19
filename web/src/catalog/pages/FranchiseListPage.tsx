import { LayoutGrid, List } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { useFranchises } from '@/catalog/hooks/useFranchises';
import { FranchiseTileGrid } from '@/catalog/components/FranchiseTileGrid';
import { FranchiseTable } from '@/catalog/components/FranchiseTable';
import { useLocalStorage } from '@/lib/use-local-storage';

type ViewMode = 'grid' | 'table';

export function FranchiseListPage() {
  const { data, isPending, isError, error } = useFranchises();
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('catalog:view-mode', 'grid');

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Catalog</h2>
            <p className="text-sm text-muted-foreground mt-1">Browse toy franchises</p>
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label="View mode">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              aria-label="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isError && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-6"
          >
            {error instanceof Error ? error.message : 'Failed to load franchises.'}
          </div>
        )}

        {isPending && !data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-6 min-h-[160px] animate-pulse bg-muted" />
            ))}
          </div>
        )}

        {data && data.data.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p>No franchises in the catalog yet.</p>
          </div>
        )}

        {data &&
          data.data.length > 0 &&
          (viewMode === 'grid' ? (
            <FranchiseTileGrid franchises={data.data} />
          ) : (
            <FranchiseTable franchises={data.data} />
          ))}
      </main>
    </div>
  );
}
