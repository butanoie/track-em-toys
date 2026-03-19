import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Search, X } from 'lucide-react';

const DEBOUNCE_MS = 300;

export function SearchInput() {
  const navigate = useNavigate();
  const currentQ = useRouterState({
    select: (s) => {
      const params = s.location.search as Record<string, unknown>;
      return typeof params.q === 'string' ? params.q : '';
    },
  });

  const [value, setValue] = useState(currentQ);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setValue(newValue);

      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        navigateToSearch(newValue, true);
      }, DEBOUNCE_MS);
    },
    [navigateToSearch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timerRef.current);
        navigateToSearch(value, false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setValue('');
        clearTimeout(timerRef.current);
        navigateToSearch('', true);
        (e.target as HTMLInputElement).blur();
      }
    },
    [navigateToSearch, value]
  );

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <form role="search" className="relative flex-1 max-w-xs" onSubmit={(e) => e.preventDefault()}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="search"
        aria-label="Search catalog"
        placeholder="Search..."
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue('');
            clearTimeout(timerRef.current);
            navigateToSearch('', true);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </form>
  );
}
