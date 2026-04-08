import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/auth/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Users, BarChart3, ArrowLeft, ImageIcon } from 'lucide-react';
import { usePendingPhotoCount } from '@/admin/hooks/usePendingPhotoCount';
import type { UserRole } from '@/lib/zod-schemas';

export const Route = createFileRoute('/_authenticated/admin')({
  component: AdminLayout,
});

interface NavItem {
  to: '/admin/photo-approvals' | '/admin/ml' | '/admin/users';
  label: string;
  icon: typeof BarChart3;
  /** Roles allowed to see this item. */
  roles: readonly UserRole[];
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/admin/photo-approvals',
    label: 'Photo Approvals',
    icon: ImageIcon,
    roles: ['curator', 'admin'],
  },
  { to: '/admin/ml', label: 'ML Stats', icon: BarChart3, roles: ['admin'] },
  { to: '/admin/users', label: 'Users', icon: Users, roles: ['admin'] },
] as const;

function AdminLayout() {
  const { user, isLoading, logout } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { data: pendingCount } = usePendingPhotoCount();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const isAllowed = !!user && (user.role === 'admin' || user.role === 'curator');

  useEffect(() => {
    if (!isLoading && !isAllowed) {
      void navigateRef.current({ to: '/' });
    }
  }, [isLoading, isAllowed]);

  if (isLoading || !user || !isAllowed) return <LoadingSpinner className="flex-1" />;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const pendingBadge = pendingCount?.count ?? 0;

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
              {visibleItems.map((item) => {
                const isActive = pathname.startsWith(item.to);
                const showBadge = item.to === '/admin/photo-approvals' && pendingBadge > 0;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`text-sm transition-colors ${
                      isActive
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {item.label}
                    {showBadge && (
                      <span
                        className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500"
                        aria-label={`${pendingBadge} pending photos`}
                      />
                    )}
                  </Link>
                );
              })}
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
            {visibleItems.map((item) => {
              const isActive = pathname.startsWith(item.to);
              const Icon = item.icon;
              const showBadge = item.to === '/admin/photo-approvals' && pendingBadge > 0;
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
                  <span className="flex-1">{item.label}</span>
                  {showBadge && (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-red-500"
                      aria-label={`${pendingBadge} pending photos`}
                    />
                  )}
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
