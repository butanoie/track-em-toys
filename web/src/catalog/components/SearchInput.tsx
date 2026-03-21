import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';

export function SearchInput() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const isOnSearchPage = useRouterState({
    select: (s) => s.location.pathname === '/catalog/search',
  });
  const currentQ = useRouterState({
    select: (s) => {
      const params = s.location.search as Record<string, unknown>;
      return typeof params.q === 'string' ? params.q : '';
    },
  });

  const [value, setValue] = useState(currentQ);

  // Sync input value when URL q param changes externally (e.g. back navigation)
  useEffect(() => {
    setValue(currentQ);
  }, [currentQ]);

  const navigateToSearch = useCallback(
    (q: string, replace: boolean) => {
      void navigate({
        to: '/catalog/search',
        search: q.trim() ? { q: q.trim() } : {},
        replace,
      });
    },
    [navigate]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      navigateToSearch(value, false);
      inputRef.current?.blur();
    },
    [navigateToSearch, value]
  );

  const clearInput = useCallback(() => {
    setValue('');
    if (isOnSearchPage) {
      navigateToSearch('', true);
    }
    inputRef.current?.focus();
  }, [isOnSearchPage, navigateToSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearInput();
        (e.target as HTMLInputElement).blur();
      }
    },
    [clearInput]
  );

  return (
    <form role="search" className="relative flex-1 max-w-xs" onSubmit={handleSubmit}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        aria-label="Search catalog"
        placeholder="Search..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full h-8 pl-8 pr-14 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Clear search"
            onClick={clearInput}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="submit"
            aria-label="Submit search"
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </form>
  );
}
