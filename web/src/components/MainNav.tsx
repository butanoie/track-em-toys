import { Link, useRouterState } from '@tanstack/react-router';

const NAV_ITEMS = [
  { to: '/' as const, label: 'Dashboard', exact: true },
  { to: '/catalog' as const, label: 'Catalog', exact: false },
  { to: '/collection' as const, label: 'My Collection', exact: false },
] as const;

export function MainNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Main navigation" className="border-b border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex items-center gap-1 -mb-px">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={`inline-flex items-center px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
