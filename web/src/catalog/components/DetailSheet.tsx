import type { ReactNode } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetPortal, SheetTitle, SheetDescription, sheetVariants } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  title: string | undefined;
  subtitle?: string;
  isPending: boolean;
  isError: boolean;
  actions?: ReactNode;
  tags?: ReactNode;
  tagAction?: ReactNode;
  children: ReactNode;
}

export function DetailSheet({
  open,
  onOpenChange,
  entityType,
  title,
  subtitle,
  isPending,
  isError,
  actions,
  tags,
  tagAction,
  children,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetPortal>
        <SheetPrimitive.Content
          aria-label={`${entityType} detail`}
          className={cn(sheetVariants({ side: 'right' }), 'sm:max-w-3xl w-full flex flex-col')}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <SheetTitle className="truncate">{isPending ? '\u00A0' : title}</SheetTitle>
              {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
              <SheetDescription className="sr-only">{entityType} details</SheetDescription>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {actions}
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close detail sheet">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {(tags || tagAction) && (
            <div className="flex items-center gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5 flex-1">{tags}</div>
              {tagAction && <div className="flex-shrink-0">{tagAction}</div>}
            </div>
          )}

          <Separator className="my-3" />

          <div className="flex-1 overflow-y-auto">
            {isPending && (
              <div className="space-y-4" aria-busy="true">
                <span className="sr-only">Loading {entityType} details...</span>
                <div className="h-6 bg-muted animate-pulse rounded w-3/4" />
                <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
                <div className="h-24 bg-muted animate-pulse rounded" />
              </div>
            )}

            {isError && !isPending && <p className="text-sm text-destructive">Failed to load {entityType} details.</p>}

            {!isPending && !isError && children}
          </div>
        </SheetPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
