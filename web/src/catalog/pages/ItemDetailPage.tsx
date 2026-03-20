import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { Route } from '@/routes/_authenticated/catalog/$franchise/items/$slug';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Separator } from '@/components/ui/separator';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { useFranchiseDetail } from '@/catalog/hooks/useFranchiseDetail';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';
import { ApiError } from '@/lib/api-client';

export function ItemDetailPage() {
  const { franchise: franchiseSlug, slug: itemSlug } = Route.useParams();

  const { data, isPending, error } = useItemDetail(franchiseSlug, itemSlug);
  const { data: franchiseDetail } = useFranchiseDetail(franchiseSlug);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Track'em Toys" />
        <MainNav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Item not found</h1>
          <p className="text-muted-foreground mb-4">
            The item &ldquo;{itemSlug}&rdquo; does not exist in this franchise.
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
          <p className="text-sm text-destructive">Failed to load item details.</p>
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
            <li>
              <Link
                to="/catalog/$franchise/items"
                params={{ franchise: franchiseSlug }}
                className="hover:text-foreground transition-colors"
              >
                Items
              </Link>
            </li>
            <li role="presentation" aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-foreground font-medium" aria-current="page">
              {data?.name ?? itemSlug}
            </li>
          </ol>
        </nav>

        {isPending && !data && <LoadingSpinner className="py-16" />}

        {data && (
          <div className="max-w-2xl">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h1 className="text-2xl font-semibold text-foreground">{data.name}</h1>
              <ShareLinkButton />
            </div>

            <Separator className="mb-6" />

            <ItemDetailContent data={data} franchise={franchiseSlug} />
          </div>
        )}
      </main>
    </div>
  );
}
