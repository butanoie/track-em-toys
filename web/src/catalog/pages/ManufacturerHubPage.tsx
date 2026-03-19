import { Link, useParams } from '@tanstack/react-router';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useManufacturerDetail } from '@/catalog/hooks/useManufacturerDetail';
import { useManufacturerItemFacets } from '@/catalog/hooks/useManufacturerItemFacets';
import { ApiError } from '@/lib/api-client';

export function ManufacturerHubPage() {
  const { slug } = useParams({ strict: false });
  const manufacturerSlug = slug ?? '';
  const { data: detail, isPending: detailPending, error: detailError } = useManufacturerDetail(manufacturerSlug);
  const { data: facets, isPending: facetsPending } = useManufacturerItemFacets(manufacturerSlug);

  const isPending = detailPending || facetsPending;

  if (detailError instanceof ApiError && detailError.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Manufacturer not found</h2>
          <p className="text-muted-foreground mb-4">
            The manufacturer &ldquo;{manufacturerSlug}&rdquo; does not exist.
          </p>
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
            <li>
              <Link to="/catalog/manufacturers" className="hover:text-foreground transition-colors">
                Manufacturers
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-foreground font-medium" aria-current="page">
              {detail?.name ?? manufacturerSlug}
            </li>
          </ol>
        </nav>

        {isPending && !detail ? (
          <LoadingSpinner className="py-16" />
        ) : detail ? (
          <>
            {/* Header + metadata */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground">{detail.name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {detail.is_official_licensee && (
                  <Badge variant="secondary" className="text-xs">
                    Official Licensee
                  </Badge>
                )}
                {detail.country && (
                  <Badge variant="outline" className="text-xs">
                    {detail.country}
                  </Badge>
                )}
                {detail.website_url && (
                  <a
                    href={detail.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Website <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              {detail.aliases.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Also known as: {detail.aliases.join(', ')}</p>
              )}
              {detail.notes && <p className="text-sm text-muted-foreground mt-2">{detail.notes}</p>}
            </div>

            {/* Franchises */}
            {facets && facets.franchises.length > 0 && (
              <section className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-3">Franchises</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {facets.franchises.map((fr) => (
                    <Link
                      key={fr.value}
                      to="/catalog/manufacturers/$slug/items"
                      params={{ slug: manufacturerSlug }}
                      search={{ franchise: fr.value }}
                    >
                      <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                        <CardContent className="p-4">
                          <p className="text-sm font-medium text-foreground">{fr.label}</p>
                          <p className="text-xs text-muted-foreground tabular-nums mt-1">
                            {fr.count} {fr.count === 1 ? 'item' : 'items'}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Toy Lines */}
            {facets && facets.toy_lines.length > 0 && (
              <section className="mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-3">Toy Lines</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {facets.toy_lines.map((tl) => (
                    <Link
                      key={tl.value}
                      to="/catalog/manufacturers/$slug/items"
                      params={{ slug: manufacturerSlug }}
                      search={{ toy_line: tl.value }}
                    >
                      <Card className="transition-all duration-200 hover:shadow-md hover:border-border cursor-pointer">
                        <CardContent className="p-4">
                          <p className="text-sm font-medium text-foreground">{tl.label}</p>
                          <p className="text-xs text-muted-foreground tabular-nums mt-1">
                            {tl.count} {tl.count === 1 ? 'item' : 'items'}
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
                    {facets.franchises.length} {facets.franchises.length === 1 ? 'franchise' : 'franchises'}
                  </Badge>
                  <Badge variant="secondary" className="text-sm py-1 px-3">
                    {facets.toy_lines.length} toy lines
                  </Badge>
                </div>
              </section>
            )}

            {/* Browse All Items CTA */}
            <Link to="/catalog/manufacturers/$slug/items" params={{ slug: manufacturerSlug }}>
              <Button size="lg" className="mt-2">
                Browse All Items
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </>
        ) : null}
      </main>
    </div>
  );
}
