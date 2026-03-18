import { Button } from '@/components/ui/button';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPageChange: (newOffset: number) => void;
}

export function Pagination({ total, limit, offset, onPageChange }: PaginationProps) {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(total / limit), 1);

  return (
    <nav className="flex items-center justify-between" aria-label="Pagination">
      <p className="text-sm text-muted-foreground">
        Showing {Math.min(offset + 1, total)}–{Math.min(offset + limit, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => onPageChange(Math.max(offset - limit, 0))}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={offset + limit >= total}
          onClick={() => onPageChange(offset + limit)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
