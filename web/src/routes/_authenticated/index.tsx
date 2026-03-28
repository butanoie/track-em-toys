import { createFileRoute, Link } from '@tanstack/react-router';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { useCollectionStats } from '@/collection/hooks/useCollectionStats';

export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useCollectionStats();

  const hasCollection = stats && stats.total_copies > 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {hasCollection ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">Your Collection</h1>
              <Link to="/collection">
                <Button variant="outline" size="sm">
                  View All
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">{stats.total_copies}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Copies</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">{stats.unique_items}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Unique Items</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">{stats.by_franchise.length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Franchises</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">
                  {stats.by_package_condition.find((c) => c.package_condition === 'mint_sealed')?.count ?? 0}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Mint Sealed</p>
              </Card>
            </div>

            <div className="text-center pt-4">
              <Link to="/catalog" className="text-sm text-primary hover:underline">
                Browse Catalog to add more items
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold text-foreground">Your Collection</h1>
            <p className="mt-2 text-muted-foreground">
              {stats ? 'Start building your collection by browsing the catalog.' : 'Your toy catalog will appear here.'}
            </p>
            <Link to="/catalog" className="inline-block mt-6">
              <Button size="lg">
                Browse Catalog
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
