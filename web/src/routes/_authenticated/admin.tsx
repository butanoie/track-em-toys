import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminLayout,
});

const NAV_ITEMS = [
  { to: '/admin/ml' as const, label: 'ML Stats', icon: BarChart3 },
  { to: '/admin/users' as const, label: 'Users', icon: Users },
] as const;

function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      void navigateRef.current({ to: '/' });
    }
  }, [isLoading, user]);

  if (isLoading || !user || user.role !== 'admin') return <LoadingSpinner className="flex-1" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Admin header — spans full width above sidebar + content */}
      <header className="border-b border-border bg-card">
        <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="text-sm font-semibold text-foreground">Admin</span>
            {/* Mobile nav links — visible when sidebar is hidden */}
            <div className="flex items-center gap-3 md:hidden">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`text-sm transition-colors ${
                    pathname.startsWith(item.to)
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
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

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-56 flex-col border-r border-border bg-card">
          <nav className="flex-1 p-2 space-y-1" aria-label="Admin navigation">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.to);
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
        </aside>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:px-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
