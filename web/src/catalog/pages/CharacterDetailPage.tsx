import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/$franchise/characters/$slug';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useCharacterDetail } from '@/catalog/hooks/useCharacterDetail';
import { useFranchiseDetail } from '@/catalog/hooks/useFranchiseDetail';
import { listCatalogItems } from '@/catalog/api';
import { CharacterDetailContent } from '@/catalog/components/CharacterDetailContent';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';
import { ApiError } from '@/lib/api-client';
import type { CatalogItemList } from '@/lib/zod-schemas';

export function CharacterDetailPage() {
  const { franchise: franchiseSlug, slug: characterSlug } = Route.useParams();

  const { data, isPending, error } = useCharacterDetail(franchiseSlug, characterSlug);
  const { data: franchiseDetail } = useFranchiseDetail(franchiseSlug);
  const { data: itemsData } = useQuery<CatalogItemList>({
    queryKey: ['catalog', 'items', franchiseSlug, { character: characterSlug }, null],
    queryFn: () => listCatalogItems({ franchise: franchiseSlug, filters: { character: characterSlug } }),
    enabled: !!franchiseSlug && !!characterSlug,
    staleTime: 60_000,
  });

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Character not found</h1>
          <p className="text-muted-foreground mb-4">
            The character &ldquo;{characterSlug}&rdquo; does not exist in this franchise.
          </p>
          <Link to="/catalog/$franchise" params={{ franchise: franchiseSlug }} className="text-primary hover:underline">
            Back to {franchiseDetail?.name ?? franchiseSlug}
          </Link>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p className="text-sm text-destructive">Failed to load character details.</p>
          <Link
            to="/catalog/$franchise"
            params={{ franchise: franchiseSlug }}
            className="text-primary hover:underline mt-4 inline-block"
          >
            Back to {franchiseDetail?.name ?? franchiseSlug}
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
              <Link
                to="/catalog/$franchise"
                params={{ franchise: franchiseSlug }}
                className="hover:text-foreground transition-colors"
              >
                {franchiseDetail?.name ?? franchiseSlug}
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-foreground font-medium" aria-current="page">
              {data?.name ?? characterSlug}
            </li>
          </ol>
        </nav>

        {isPending && !data && <LoadingSpinner className="py-16" />}

        {data && (
          <div className="max-w-2xl">
            <div className="flex items-start justify-between gap-2">
              <h1 className="text-2xl font-semibold text-foreground">{data.name}</h1>
              <ShareLinkButton />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-4">
              <Badge variant="secondary">{data.franchise.name}</Badge>
              <Badge variant="secondary">{data.continuity_family.name}</Badge>
              {data.is_combined_form && (
                <Badge
                  variant="outline"
                  className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                >
                  Combined Form
                </Badge>
              )}
            </div>

            <Separator className="mb-6" />

            <CharacterDetailContent
              data={data}
              relatedItems={itemsData?.data}
              relatedItemsCount={itemsData?.total_count}
              hideTags
            />
          </div>
        )}
      </main>
    </div>
  );
}
