import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/$franchise/index';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useFranchiseDetail } from '@/catalog/hooks/useFranchiseDetail';
import { useItemFacets } from '@/catalog/hooks/useItemFacets';
import { useCharacterFacets } from '@/catalog/hooks/useCharacterFacets';
import { ApiError } from '@/lib/api-client';
import type { ItemFacets } from '@/lib/zod-schemas';

function ItemsHubView({ franchiseSlug, facets }: { franchiseSlug: string; facets: ItemFacets | undefined }) {
  return (
    <>
      {/* Continuity Families */}
      {facets && facets.continuity_families.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">Continuity Families</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {facets.continuity_families.map((cf) => (
              <Link
                key={cf.value}
                to="/catalog/$franchise/items"
                params={{ franchise: franchiseSlug }}
                search={{ continuity_family: cf.value }}
              >
                <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-foreground">{cf.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-1">
                      {cf.count} {cf.count === 1 ? 'item' : 'items'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Manufacturers */}
      {facets && facets.manufacturers.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">Manufacturers</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {facets.manufacturers.map((mfr) => (
              <Link
                key={mfr.value}
                to="/catalog/$franchise/items"
                params={{ franchise: franchiseSlug }}
                search={{ manufacturer: mfr.value }}
              >
                <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-foreground">{mfr.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-1">
                      {mfr.count} {mfr.count === 1 ? 'item' : 'items'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick Stats */}
      {facets && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">Quick Stats</h3>
          <div className="flex flex-wrap gap-4">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {facets.is_third_party.reduce((sum, v) => sum + v.count, 0)} items total
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {facets.continuity_families.length} continuities
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {facets.manufacturers.length} manufacturers
            </Badge>
          </div>
        </section>
      )}

      {/* Browse All Items CTA */}
      <Link to="/catalog/$franchise/items" params={{ franchise: franchiseSlug }}>
        <Button size="lg" className="mt-2">
          Browse All Items
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
    </>
  );
}

function CharactersHubView({ franchiseSlug }: { franchiseSlug: string }) {
  const { data: facets } = useCharacterFacets(franchiseSlug);

  return (
    <>
      {/* Factions */}
      {facets && facets.factions.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">Factions</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {facets.factions.map((f) => (
              <Link
                key={f.value}
                to="/catalog/$franchise/characters"
                params={{ franchise: franchiseSlug }}
                search={{ faction: f.value }}
              >
                <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-foreground">{f.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-1">
                      {f.count} {f.count === 1 ? 'character' : 'characters'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sub-groups */}
      {facets && facets.sub_groups.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">Sub-groups</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {facets.sub_groups.map((sg) => (
              <Link
                key={sg.value}
                to="/catalog/$franchise/characters"
                params={{ franchise: franchiseSlug }}
                search={{ sub_group: sg.value }}
              >
                <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-foreground">{sg.label}</p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-1">
                      {sg.count} {sg.count === 1 ? 'character' : 'characters'}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Browse All Characters CTA */}
      <Link to="/catalog/$franchise/characters" params={{ franchise: franchiseSlug }}>
        <Button size="lg" className="mt-2">
          Browse All Characters
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </Link>
    </>
  );
}

export function FranchiseHubPage() {
  const { franchise } = useParams({ strict: false });
  const franchiseSlug = franchise ?? '';
  const search = Route.useSearch();
  const activeView = search.view ?? 'items';

  const { data: detail, isPending: detailPending, error: detailError } = useFranchiseDetail(franchiseSlug);
  const { data: facets, isPending: facetsPending } = useItemFacets(franchiseSlug);

  const isPending = detailPending || facetsPending;

  if (detailError instanceof ApiError && detailError.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Franchise not found</h1>
          <p className="text-muted-foreground mb-4">The franchise &ldquo;{franchiseSlug}&rdquo; does not exist.</p>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <li>
              <Link to="/catalog" className="hover:text-foreground transition-colors">
                Catalog
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-foreground font-medium" aria-current="page">
              {detail?.name ?? franchiseSlug}
            </li>
          </ol>
        </nav>

        {isPending && !detail ? (
          <LoadingSpinner className="py-16" />
        ) : detail ? (
          <>
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">{detail.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {activeView === 'items' ? (
                  <>
                    Browse items{' '}
                    <Link
                      to="/catalog/$franchise"
                      params={{ franchise: franchiseSlug }}
                      search={{ view: 'characters' }}
                      className="text-primary hover:underline"
                    >
                      or characters
                    </Link>
                  </>
                ) : (
                  <>
                    Browse characters{' '}
                    <Link
                      to="/catalog/$franchise"
                      params={{ franchise: franchiseSlug }}
                      className="text-primary hover:underline"
                    >
                      or items
                    </Link>
                  </>
                )}
              </p>
              {detail.notes && <p className="text-sm text-muted-foreground mt-1">{detail.notes}</p>}
            </div>

            {activeView === 'items' ? (
              <ItemsHubView franchiseSlug={franchiseSlug} facets={facets} />
            ) : (
              <CharactersHubView franchiseSlug={franchiseSlug} />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
