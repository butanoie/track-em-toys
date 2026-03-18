import { createFileRoute } from '@tanstack/react-router';
import { AppHeader } from '@/components/AppHeader';

export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Track'em Toys" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-foreground">Your Collection</h2>
          <p className="mt-2 text-muted-foreground">Your toy catalog will appear here.</p>
        </div>
      </main>
    </div>
  );
}
