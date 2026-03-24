import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PAGE_LIMIT_OPTIONS, type PageLimitOption } from '@/lib/pagination-constants';

interface PageSizeSelectorProps {
  value: number;
  onChange: (limit: PageLimitOption) => void;
}

export function PageSizeSelector({ value, onChange }: PageSizeSelectorProps) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const n = Number(v);
        if (PAGE_LIMIT_OPTIONS.includes(n as PageLimitOption)) {
          onChange(n as PageLimitOption);
        }
      }}
    >
      <SelectTrigger className="w-[120px]" aria-label="Items per page">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAGE_LIMIT_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={String(opt)}>
            {opt} / page
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
