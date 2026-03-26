import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CharacterAppearance } from '@/lib/zod-schemas';

interface AppearancesTableProps {
  appearances: CharacterAppearance[];
}

function formatYears(yearStart: number | null, yearEnd: number | null): string {
  if (yearStart === null && yearEnd === null) return '—';
  if (yearStart !== null && yearEnd !== null) {
    return yearStart === yearEnd ? `${yearStart}` : `${yearStart}–${yearEnd}`;
  }
  if (yearStart !== null) return `${yearStart}`;
  return `${yearEnd}`;
}

export function AppearancesTable({ appearances }: AppearancesTableProps) {
  if (appearances.length === 0) {
    return <p className="text-sm text-muted-foreground">None recorded.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/2 ps-0">Name</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Years</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {appearances.map((appearance) => (
          <TableRow key={appearance.id}>
            <TableCell className="font-medium ps-0">{appearance.name}</TableCell>
            <TableCell>{appearance.source_media ?? '—'}</TableCell>
            <TableCell className="tabular-nums">{formatYears(appearance.year_start, appearance.year_end)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
