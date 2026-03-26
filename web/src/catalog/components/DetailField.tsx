import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DetailFieldProps {
  label: string;
  value?: string | null | undefined;
  children?: ReactNode;
  className?: string;
}

export function DetailField({ label, value, children, className }: DetailFieldProps) {
  if (!children && !value) return null;
  return (
    <div className={cn(className)}>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{children ?? value}</dd>
    </div>
  );
}
