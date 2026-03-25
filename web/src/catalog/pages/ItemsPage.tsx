import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, Download, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Route } from '@/routes/_authenticated/catalog/$franchise/items/index';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Pagination } from '@/catalog/components/Pagination';
import { PageSizeSelector } from '@/components/PageSizeSelector';
import { DEFAULT_PAGE_LIMIT, type PageLimitOption } from '@/lib/pagination-constants';
import { useAuth } from '@/auth/useAuth';
import { useItems } from '@/catalog/hooks/useItems';
import { useItemFacets } from '@/catalog/hooks/useItemFacets';
import { useFranchiseDetail } from '@/catalog/hooks/useFranchiseDetail';
import { exportForMl } from '@/catalog/api';
import { FacetSidebar, type FacetGroupConfig } from '@/catalog/components/FacetSidebar';
import { ItemList } from '@/catalog/components/ItemList';
import { ItemDetailSheet } from '@/catalog/components/ItemDetailSheet';
import { ApiError } from '@/lib/api-client';
import type { ItemFilters } from '@/catalog/api';

export function ItemsPage() {
  const { franchise } = useParams({ strict: false });
  const franchiseSlug = franchise ?? '';
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const page = search.page ?? 1;
  const limit = search.limit ?? DEFAULT_PAGE_LIMIT;

  const { data: detail, error: detailError } = useFranchiseDetail(franchiseSlug);

  const filters: ItemFilters = useMemo(() => {
    const f: ItemFilters = {};
    if (search.manufacturer) f.manufacturer = search.manufacturer;
    if (search.size_class) f.size_class = search.size_class;
    if (search.toy_line) f.toy_line = search.toy_line;
    if (search.continuity_family) f.continuity_family = search.continuity_family;
    if (search.is_third_party !== undefined) f.is_third_party = search.is_third_party;
    if (search.character) f.character = search.character;
    return f;
  }, [
    search.manufacturer,
    search.size_class,
    search.toy_line,
    search.continuity_family,
    search.is_third_party,
    search.character,
  ]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const exportMutation = useMutation({
    mutationFn: () => exportForMl({ franchise: franchiseSlug, filters }),
    onSuccess: (result) => {
      toast.success(
        `Export complete — ${result.stats.total_photos} photos, ${result.stats.items} items → ${result.filename}`
      );
    },
    onError: () => {
      toast.error('ML export failed. Check server logs.');
    },
  });

  const { data: itemsData, isPending: itemsPending } = useItems(franchiseSlug, filters, page, limit);
  const { data: facetsData } = useItemFacets(franchiseSlug, filters);

  const facetGroups: FacetGroupConfig[] = useMemo(() => {
    if (!facetsData) return [];
    return [
      {
        label: 'Continuity',
        values: facetsData.continuity_families,
        filterKey: 'continuity_family',
        activeValue: filters.continuity_family,
      },
      {
        label: 'Manufacturer',
        values: facetsData.manufacturers,
        filterKey: 'manufacturer',
        activeValue: filters.manufacturer,
      },
      { label: 'Toy Line', values: facetsData.toy_lines, filterKey: 'toy_line', activeValue: filters.toy_line },
      {
        label: 'Size Class',
        values: facetsData.size_classes,
        filterKey: 'size_class',
        activeValue: filters.size_class,
      },
      {
        label: 'Type',
        values: facetsData.is_third_party,
        filterKey: 'is_third_party',
        activeValue: filters.is_third_party,
      },
    ];
  }, [facetsData, filters]);

  const setFilter = useCallback(
    (key: keyof ItemFilters, value: string | boolean | undefined) => {
      void navigate({
        to: '/catalog/$franchise/items',
        params: { franchise: franchiseSlug },
        search: (prev) => {
          const next = { ...prev, [key]: value, page: undefined, selected: undefined };
          for (const [k, v] of Object.entries(next)) {
            if (v === undefined || v === '') {
              delete (next as Record<string, unknown>)[k];
            }
          }
          return next;
        },
      });
    },
    [navigate, franchiseSlug]
  );

  const clearFilters = useCallback(() => {
    void navigate({
      to: '/catalog/$franchise/items',
      params: { franchise: franchiseSlug },
      search: {},
    });
  }, [navigate, franchiseSlug]);

  const selectItem = useCallback(
    (slug: string | undefined) => {
      void navigate({
        to: '/catalog/$franchise/items',
        params: { franchise: franchiseSlug },
        search: (prev) => {
          const next = { ...prev, selected: slug };
          if (!slug) delete (next as Record<string, unknown>).selected;
          return next;
        },
      });
    },
    [navigate, franchiseSlug]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      void navigate({
        to: '/catalog/$franchise/items',
        params: { franchise: franchiseSlug },
        search: (prev) => ({ ...prev, page: newPage, selected: undefined }),
      });
    },
    [navigate, franchiseSlug]
  );

  const handleLimitChange = useCallback(
    (newLimit: PageLimitOption) => {
      void navigate({
        to: '/catalog/$franchise/items',
        params: { franchise: franchiseSlug },
        search: (prev) => {
          const next = {
            ...prev,
            limit: newLimit === DEFAULT_PAGE_LIMIT ? undefined : newLimit,
            page: undefined,
            selected: undefined,
          };
          for (const [k, v] of Object.entries(next)) {
            if (v === undefined) delete (next as Record<string, unknown>)[k];
          }
          return next;
        },
      });
    },
    [navigate, franchiseSlug]
  );

  // Franchise not found
  if (detailError instanceof ApiError && detailError.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Franchise not found</h1>
          <Link to="/catalog" className="text-primary hover:underline">
            Back to Catalog
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link to="/catalog" className="hover:text-foreground transition-colors">
                Catalog
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li>
              <Link
                to="/catalog/$franchise"
                params={{ franchise: franchiseSlug }}
                className="hover:text-foreground transition-colors"
              >
                {detail?.name ?? franchiseSlug}
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-foreground font-medium" aria-current="page">
              Items
            </li>
          </ol>
        </nav>

        {/* Active filters bar */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            {Object.entries(filters).map(([key, value]) => (
              <Button
                key={key}
                variant="secondary"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setFilter(key as keyof ItemFilters, undefined)}
                aria-label={`Remove filter: ${key.replace(/_/g, ' ')}: ${String(value)}`}
              >
                {key.replace(/_/g, ' ')}: {String(value)}
                <X className="h-3 w-3" />
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
              Clear all
            </Button>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          {/* Facets sidebar — hidden on mobile, visible on lg+ */}
          <div className="hidden lg:block">
            {facetsData ? (
              <FacetSidebar
                groups={facetGroups}
                onFilterChange={(key, value) => setFilter(key as keyof ItemFilters, value)}
              />
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded" />
                ))}
              </div>
            )}
          </div>

          {/* Center: item list */}
          <div className="min-w-0">
            {user?.role === 'admin' && itemsData && (
              <div className="flex justify-end mb-3">
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
              </div>
            )}
            {itemsPending && !itemsData ? (
              <LoadingSpinner className="py-16" />
            ) : itemsData ? (
              <>
                <ItemList
                  items={itemsData.data}
                  selectedSlug={search.selected}
                  onSelect={selectItem}
                  totalCount={itemsData.total_count}
                  paginationControls={<PageSizeSelector value={limit} onChange={handleLimitChange} />}
                />
                <Pagination
                  page={page}
                  totalCount={itemsData.total_count}
                  limit={itemsData.limit}
                  onPageChange={handlePageChange}
                  ariaLabel="Items pagination"
                />
              </>
            ) : null}
          </div>
        </div>

        <ItemDetailSheet franchise={franchiseSlug} itemSlug={search.selected} onClose={() => selectItem(undefined)} />
      </main>
    </div>
  );
}
