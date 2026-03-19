import { createFileRoute, Link } from '@tanstack/react-router';
import { AppHeader } from '@/components/AppHeader';
import { MainNav } from '@/components/MainNav';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />
      <MainNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-foreground">Your Collection</h2>
          <p className="mt-2 text-muted-foreground">Your toy catalog will appear here.</p>
          <Link to="/catalog" className="inline-block mt-6">
            <Button size="lg">
              Browse Catalog
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
