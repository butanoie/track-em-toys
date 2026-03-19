import { useEffect, useRef, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface DetailPanelShellProps {
  entityType: string;
  slug: string | undefined;
  title: string | undefined;
  emptyMessage: string;
  isPending: boolean;
  isError: boolean;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}

export function DetailPanelShell({
  entityType,
  slug,
  title,
  emptyMessage,
  isPending,
  isError,
  onClose,
  actions,
  children,
}: DetailPanelShellProps) {
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (slug && panelRef.current) {
      panelRef.current.focus();
    }
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [slug, onClose]);

  if (!slug) {
    return (
      <aside
        role="complementary"
        aria-label={`${entityType} detail`}
        className="hidden lg:flex items-center justify-center text-center p-8 text-muted-foreground"
      >
        <p className="text-sm">{emptyMessage}</p>
      </aside>
    );
  }

  if (isPending) {
    return (
      <aside role="complementary" aria-label={`${entityType} detail`} aria-busy="true" className="p-4 space-y-4">
        <span className="sr-only">Loading {entityType} details...</span>
        <div className="h-6 bg-muted animate-pulse rounded w-3/4" />
        <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
        <div className="h-24 bg-muted animate-pulse rounded" />
      </aside>
    );
  }

  if (isError || !title) {
    return (
      <aside role="complementary" aria-label={`${entityType} detail`} className="p-4">
        <p className="text-sm text-destructive">Failed to load {entityType} details.</p>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={`${entityType} detail: ${title}`}
      tabIndex={-1}
      className="p-4 overflow-y-auto focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-1 flex-shrink-0">
          {actions}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Separator className="mb-4" />

      {children}
    </aside>
  );
}
