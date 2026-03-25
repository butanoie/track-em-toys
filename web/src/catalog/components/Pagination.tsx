import { useMemo } from 'react';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalCount: number;
  limit: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}

function getVisiblePages(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];

  if (current > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('ellipsis');
  }

  pages.push(total);

  return pages;
}

export function Pagination({ page, totalCount, limit, onPageChange, ariaLabel = 'Pagination' }: PaginationProps) {
  const totalPages = Math.ceil(totalCount / limit);
  const visiblePages = useMemo(() => getVisiblePages(page, totalPages), [page, totalPages]);

  if (totalPages <= 1) return null;

  return (
    <nav aria-label={ariaLabel} className="flex items-center justify-center gap-1 mt-4">
      <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </Button>

      {visiblePages.map((p, index) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground" aria-hidden="true">
            ...
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="sm"
            className="min-w-[2rem]"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </Button>
        )
      )}

      <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next
      </Button>
    </nav>
  );
}
