import { Link } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ManufacturerStatsItem } from '@/lib/zod-schemas';

interface ManufacturerTableProps {
  manufacturers: ManufacturerStatsItem[];
}

export function ManufacturerTable({ manufacturers }: ManufacturerTableProps) {
  return (
    <div className="rounded-md border">
      <Table aria-label="Manufacturers list">
        <TableHeader>
          <TableRow>
            <TableHead>Manufacturer</TableHead>
            <TableHead className="text-right tabular-nums">Items</TableHead>
            <TableHead className="text-right tabular-nums">Toy Lines</TableHead>
            <TableHead className="text-right tabular-nums">Franchises</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {manufacturers.map((m) => (
            <TableRow key={m.slug}>
              <TableCell>
                <Link
                  to="/catalog/manufacturers/$slug"
                  params={{ slug: m.slug }}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                >
                  {m.name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">{m.item_count}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{m.toy_line_count}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{m.franchise_count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
