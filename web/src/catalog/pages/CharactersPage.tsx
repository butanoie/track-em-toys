import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/$franchise/characters/index';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Pagination } from '@/catalog/components/Pagination';
import { PageSizeSelector } from '@/components/PageSizeSelector';
import { DEFAULT_PAGE_LIMIT, type PageLimitOption } from '@/lib/pagination-constants';
import { useCharacters } from '@/catalog/hooks/useCharacters';
import { useCharacterFacets } from '@/catalog/hooks/useCharacterFacets';
import { useFranchiseDetail } from '@/catalog/hooks/useFranchiseDetail';
import { FacetSidebar, type FacetGroupConfig } from '@/catalog/components/FacetSidebar';
import { CharacterList } from '@/catalog/components/CharacterList';
import { CharacterDetailSheet } from '@/catalog/components/CharacterDetailSheet';
import { ApiError } from '@/lib/api-client';
import type { CharacterFilters } from '@/catalog/api';

export function CharactersPage() {
  const { franchise } = useParams({ strict: false });
  const franchiseSlug = franchise ?? '';
  const search = Route.useSearch();
  const navigate = useNavigate();

  const page = search.page ?? 1;
  const limit = search.limit ?? DEFAULT_PAGE_LIMIT;

  const { data: detail, error: detailError } = useFranchiseDetail(franchiseSlug);

  const filters: CharacterFilters = useMemo(() => {
    const f: CharacterFilters = {};
    if (search.continuity_family) f.continuity_family = search.continuity_family;
    if (search.faction) f.faction = search.faction;
    if (search.character_type) f.character_type = search.character_type;
    if (search.sub_group) f.sub_group = search.sub_group;
    return f;
  }, [search.continuity_family, search.faction, search.character_type, search.sub_group]);

  const hasActiveFilters = Object.keys(filters).length > 0;

  const { data: charactersData, isPending: charactersPending } = useCharacters(franchiseSlug, filters, page, limit);
  const { data: facetsData } = useCharacterFacets(franchiseSlug, filters);

  const facetGroups: FacetGroupConfig[] = useMemo(() => {
    if (!facetsData) return [];
    return [
      {
        label: 'Faction',
        values: facetsData.factions,
        filterKey: 'faction',
        activeValue: filters.faction,
      },
      {
        label: 'Character Type',
        values: facetsData.character_types,
        filterKey: 'character_type',
        activeValue: filters.character_type,
      },
      {
        label: 'Sub-group',
        values: facetsData.sub_groups,
        filterKey: 'sub_group',
        activeValue: filters.sub_group,
      },
    ];
  }, [facetsData, filters]);

  const setFilter = useCallback(
    (key: keyof CharacterFilters, value: string | boolean | undefined) => {
      void navigate({
        to: '/catalog/$franchise/characters',
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
      to: '/catalog/$franchise/characters',
      params: { franchise: franchiseSlug },
      search: {},
    });
  }, [navigate, franchiseSlug]);

  const selectCharacter = useCallback(
    (slug: string | undefined) => {
      void navigate({
        to: '/catalog/$franchise/characters',
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
        to: '/catalog/$franchise/characters',
        params: { franchise: franchiseSlug },
        search: (prev) => ({ ...prev, page: newPage, selected: undefined }),
      });
    },
    [navigate, franchiseSlug]
  );

  const handleLimitChange = useCallback(
    (newLimit: PageLimitOption) => {
      void navigate({
        to: '/catalog/$franchise/characters',
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
              Characters
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
                onClick={() => setFilter(key as keyof CharacterFilters, undefined)}
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
                onFilterChange={(key, value) => setFilter(key as keyof CharacterFilters, value)}
              />
            ) : (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded" />
                ))}
              </div>
            )}
          </div>

          {/* Center: character list */}
          <div className="min-w-0">
            {charactersPending && !charactersData ? (
              <LoadingSpinner className="py-16" />
            ) : charactersData ? (
              <>
                <CharacterList
                  characters={charactersData.data}
                  selectedSlug={search.selected}
                  onSelect={selectCharacter}
                  totalCount={charactersData.total_count}
                  paginationControls={<PageSizeSelector value={limit} onChange={handleLimitChange} />}
                />
                <Pagination
                  page={page}
                  totalCount={charactersData.total_count}
                  limit={charactersData.limit}
                  onPageChange={handlePageChange}
                  ariaLabel="Characters pagination"
                />
              </>
            ) : null}
          </div>
        </div>

        <CharacterDetailSheet
          franchise={franchiseSlug}
          characterSlug={search.selected}
          onClose={() => selectCharacter(undefined)}
        />
      </main>
    </div>
  );
}
