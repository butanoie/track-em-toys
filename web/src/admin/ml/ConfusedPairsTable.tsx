import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatClassLabel } from './format-utils';
import type { ConfusedPair } from '@/lib/zod-schemas';

interface ConfusedPairsTableProps {
  pairs: ConfusedPair[];
}

export function ConfusedPairsTable({ pairs }: ConfusedPairsTableProps) {
  if (pairs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">No confused pairs — perfect classification.</p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>True Class</TableHead>
            <TableHead>Predicted As</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">% of True</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pairs.map((pair, i) => (
            <TableRow key={i}>
              <TableCell className="text-sm">{formatClassLabel(pair.true_label)}</TableCell>
              <TableCell className="text-sm">{formatClassLabel(pair.predicted_label)}</TableCell>
              <TableCell className="text-sm text-right tabular-nums">{pair.count}</TableCell>
              <TableCell className="text-sm text-right tabular-nums">
                {(pair.pct_of_true_class * 100).toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
