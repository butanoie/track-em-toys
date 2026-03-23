import { Textarea } from '@/components/ui/textarea';

interface NotesFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function NotesField({ id, value, onChange, disabled = false }: NotesFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium mb-2 block">
        Notes <span className="text-muted-foreground font-normal">(optional)</span>
      </label>
      <Textarea
        id={id}
        placeholder="e.g., Found at a flea market, box has shelf wear..."
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground mt-1 tabular-nums text-right">{value.length}/2000</p>
    </div>
  );
}
