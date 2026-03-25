import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/manufacturers/$slug/items';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Pagination } from '@/catalog/components/Pagination';
import { PageSizeSelector } from '@/components/PageSizeSelector';
import { DEFAULT_PAGE_LIMIT, type PageLimitOption } from '@/lib/pagination-constants';
import { useManufacturerItems } from '@/catalog/hooks/useManufacturerItems';
import { useManufacturerItemFacets } from '@/catalog/hooks/useManufacturerItemFacets';
import { useManufacturerDetail } from '@/catalog/hooks/useManufacturerDetail';
import { FacetSidebar, type FacetGroupConfig } from '@/catalog/components/FacetSidebar';
import { ItemList } from '@/catalog/components/ItemList';
import { ItemDetailSheet } from '@/catalog/components/ItemDetailSheet';
import { ApiError } from '@/lib/api-client';
import type { ManufacturerItemFilters } from '@/catalog/api';

export function ManufacturerItemsPage() {
  const { slug } = useParams({ strict: false });
  const manufacturerSlug = slug ?? '';
  const search = Route.useSearch();
  const navigate = useNavigate();

  const page = search.page ?? 1;
  const limit = search.limit ?? DEFAULT_PAGE_LIMIT;

  const { data: detail, error: detailError } = useManufacturerDetail(manufacturerSlug);

  const filters: ManufacturerItemFilters = useMemo(() => {
    const f: ManufacturerItemFilters = {};
    if (search.franchise) f.franchise = search.franchise;
    if (search.size_class) f.size_class = search.size_class;
    if (search.toy_line) f.toy_line = search.toy_line;
    if (search.continuity_family) f.continuity_family = search.continuity_family;
    if (search.is_third_party !== undefined) f.is_third_party = search.is_third_party;
    return f;
  }, [search.franchise, search.size_class, search.toy_line, search.continuity_family, search.is_third_party]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const { data: itemsData, isPending: itemsPending } = useManufacturerItems(manufacturerSlug, filters, page, limit);
  const { data: facetsData } = useManufacturerItemFacets(manufacturerSlug, filters);

  const selectedItem = useMemo(
    () => itemsData?.data.find((i) => i.slug === search.selected),
    [itemsData?.data, search.selected]
  );

  const facetGroups: FacetGroupConfig[] = useMemo(() => {
    if (!facetsData) return [];
    return [
      { label: 'Franchise', values: facetsData.franchises, filterKey: 'franchise', activeValue: filters.franchise },
      {
        label: 'Continuity',
        values: facetsData.continuity_families,
        filterKey: 'continuity_family',
        activeValue: filters.continuity_family,
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
    (key: string, value: string | boolean | undefined) => {
      void navigate({
        to: '/catalog/manufacturers/$slug/items',
        params: { slug: manufacturerSlug },
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
    [navigate, manufacturerSlug]
  );

  const clearFilters = useCallback(() => {
    void navigate({
      to: '/catalog/manufacturers/$slug/items',
      params: { slug: manufacturerSlug },
      search: {},
    });
  }, [navigate, manufacturerSlug]);

  const selectItem = useCallback(
    (itemSlug: string | undefined) => {
      void navigate({
        to: '/catalog/manufacturers/$slug/items',
        params: { slug: manufacturerSlug },
        search: (prev) => {
          const next = { ...prev, selected: itemSlug };
          if (!itemSlug) delete (next as Record<string, unknown>).selected;
          return next;
        },
      });
    },
    [navigate, manufacturerSlug]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      void navigate({
        to: '/catalog/manufacturers/$slug/items',
        params: { slug: manufacturerSlug },
        search: (prev) => ({ ...prev, page: newPage, selected: undefined }),
      });
    },
    [navigate, manufacturerSlug]
  );

  const handleLimitChange = useCallback(
    (newLimit: PageLimitOption) => {
      void navigate({
        to: '/catalog/manufacturers/$slug/items',
        params: { slug: manufacturerSlug },
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
    [navigate, manufacturerSlug]
  );

  // Manufacturer not found
  if (detailError instanceof ApiError && detailError.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Manufacturer not found</h1>
          <Link to="/catalog/manufacturers" className="text-primary hover:underline">
            Back to Manufacturers
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
              <Link to="/catalog/manufacturers" className="hover:text-foreground transition-colors">
                Manufacturers
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li>
              <Link
                to="/catalog/manufacturers/$slug"
                params={{ slug: manufacturerSlug }}
                className="hover:text-foreground transition-colors"
              >
                {detail?.name ?? manufacturerSlug}
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
                onClick={() => setFilter(key, undefined)}
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
          {/* Facets sidebar */}
          <div className="hidden lg:block">
            {facetsData ? (
              <FacetSidebar groups={facetGroups} onFilterChange={setFilter} />
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

        <ItemDetailSheet
          franchise={selectedItem?.franchise.slug ?? ''}
          itemSlug={search.selected}
          onClose={() => selectItem(undefined)}
        />
      </main>
    </div>
  );
}
