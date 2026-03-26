import { useNavigate } from '@tanstack/react-router';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ManufacturerStatsItem } from '@/lib/zod-schemas';

interface ManufacturerTableProps {
  manufacturers: ManufacturerStatsItem[];
}

export function ManufacturerTable({ manufacturers }: ManufacturerTableProps) {
  const navigate = useNavigate();

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
            <TableRow
              key={m.slug}
              className="cursor-pointer"
              onClick={() => {
                void navigate({ to: '/catalog/manufacturers/$slug', params: { slug: m.slug } });
              }}
            >
              <TableCell className="text-sm font-medium text-foreground">{m.name}</TableCell>
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
