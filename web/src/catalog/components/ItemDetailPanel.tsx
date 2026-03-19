import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';

interface ItemDetailPanelProps {
  franchise: string;
  itemSlug: string | undefined;
  onClose: () => void;
}

function dataQualityStyle(quality: string): string {
  switch (quality) {
    case 'verified':
      return 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300';
    case 'community_verified':
      return 'border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300';
    default:
      return 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300';
  }
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value}</dd>
    </div>
  );
}

export function ItemDetailPanel({ franchise, itemSlug, onClose }: ItemDetailPanelProps) {
  const { data, isPending, isError } = useItemDetail(franchise, itemSlug);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (itemSlug && panelRef.current) {
      panelRef.current.focus();
    }
  }, [itemSlug]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && itemSlug) {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [itemSlug, onClose]);

  if (!itemSlug) {
    return (
      <aside
        role="complementary"
        aria-label="Item detail"
        className="hidden lg:flex items-center justify-center text-center p-8 text-muted-foreground"
      >
        <p className="text-sm">Select an item to view details</p>
      </aside>
    );
  }

  if (isPending) {
    return (
      <aside role="complementary" aria-label="Item detail" aria-busy="true" className="p-4 space-y-4">
        <span className="sr-only">Loading item details...</span>
        <div className="h-6 bg-muted animate-pulse rounded w-3/4" />
        <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
        <div className="h-24 bg-muted animate-pulse rounded" />
      </aside>
    );
  }

  if (isError || !data) {
    return (
      <aside role="complementary" aria-label="Item detail" className="p-4">
        <p className="text-sm text-destructive">Failed to load item details.</p>
      </aside>
    );
  }

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label={`Item detail: ${data.name}`}
      tabIndex={-1}
      className="p-4 overflow-y-auto focus:outline-none"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">{data.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel" className="flex-shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator className="mb-4" />

      {data.photos.length > 0 && (
        <div className="mb-4 rounded-md overflow-hidden bg-muted aspect-square flex items-center justify-center">
          <img
            src={data.photos[0]?.url}
            alt={data.photos[0]?.caption ?? data.name}
            className="object-contain max-h-full max-w-full"
          />
        </div>
      )}

      <dl className="space-y-3">
        <DetailField label="Character" value={data.character.name} />
        <DetailField label="Manufacturer" value={data.manufacturer?.name} />
        <DetailField label="Toy Line" value={data.toy_line.name} />
        <DetailField label="Size Class" value={data.size_class} />
        <DetailField label="Year Released" value={data.year_released?.toString()} />
        <DetailField label="Product Code" value={data.product_code} />

        {data.appearance && <DetailField label="Appearance" value={data.appearance.name} />}

        <div>
          <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</dt>
          <dd className="mt-0.5">
            <Badge variant="outline" className={dataQualityStyle(data.data_quality)}>
              {data.data_quality.replace('_', ' ')}
            </Badge>
          </dd>
        </div>

        {data.is_third_party && (
          <div>
            <Badge
              variant="outline"
              className="border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300"
            >
              Third Party
            </Badge>
          </div>
        )}

        {data.description && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</dt>
            <dd className="text-sm mt-0.5 text-muted-foreground">{data.description}</dd>
          </div>
        )}
      </dl>
    </aside>
  );
}
