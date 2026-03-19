import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FranchiseStatsItem } from '@/lib/zod-schemas';

interface FranchiseTableProps {
  franchises: FranchiseStatsItem[];
}

export function FranchiseTable({ franchises }: FranchiseTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Franchise</TableHead>
            <TableHead className="text-right tabular-nums">Items</TableHead>
            <TableHead className="text-right tabular-nums">Continuities</TableHead>
            <TableHead className="text-right tabular-nums">Manufacturers</TableHead>
            <TableHead className="hidden md:table-cell">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {franchises.map((f) => (
            <TableRow key={f.slug}>
              <TableCell>
                <Link
                  to="/catalog/$franchise"
                  params={{ franchise: f.slug }}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {f.name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">{f.item_count}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{f.continuity_family_count}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{f.manufacturer_count}</TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-xs">
                {f.notes ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
