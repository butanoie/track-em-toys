import { Link } from '@tanstack/react-router';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/catalog/components/SearchInput';

interface AppHeaderProps {
  title: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground flex-shrink-0">{title}</h1>
        <SearchInput />
        <div className="flex items-center gap-4 flex-shrink-0">
          {user && (
            <span className="text-sm text-muted-foreground">{user.display_name ?? user.email ?? 'Collector'}</span>
          )}
          {user?.role === 'admin' && (
            <Link to="/admin/users" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Admin
            </Link>
          )}
          <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Settings
          </Link>
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
  );
}
