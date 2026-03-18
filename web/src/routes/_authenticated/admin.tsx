import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Users, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminLayout,
});

const NAV_ITEMS = [
  { to: '/admin/users' as const, label: 'Users', icon: Users },
  // Future: { to: '/admin/catalog', label: 'Catalog', icon: LayoutList },
  // Future: { to: '/admin/system', label: 'System', icon: Settings },
] as const;

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
      />
    </div>
  );
}

function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      void navigateRef.current({ to: '/' });
    }
  }, [isLoading, user]);

  if (isLoading || !user || user.role !== 'admin') return <LoadingSpinner />;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Admin</h2>
        </div>
        <Separator />
        <nav className="flex-1 p-2 space-y-1" aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Separator />
        <div className="p-2">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Admin header */}
        <header className="border-b border-border">
          <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            {/* Mobile nav - show on small screens where sidebar is hidden */}
            <div className="flex items-center gap-4 md:hidden">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <span className="text-sm font-semibold text-foreground">Admin</span>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="hidden md:block" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{user.display_name ?? user.email ?? 'Admin'}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void logout();
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
