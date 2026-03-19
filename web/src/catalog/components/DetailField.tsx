import type { ReactNode } from 'react';

interface DetailFieldProps {
  label: string;
  value?: string | null | undefined;
  children?: ReactNode;
}

export function DetailField({ label, value, children }: DetailFieldProps) {
  if (!children && !value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{children ?? value}</dd>
    </div>
  );
}
