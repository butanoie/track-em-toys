import { Link } from '@tanstack/react-router';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { DetailPanelShell } from '@/catalog/components/DetailPanelShell';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';

interface ItemDetailPanelProps {
  franchise: string;
  itemSlug: string | undefined;
  onClose: () => void;
}

export function ItemDetailPanel({ franchise, itemSlug, onClose }: ItemDetailPanelProps) {
  const { data, isPending, isError } = useItemDetail(franchise, itemSlug);

  return (
    <DetailPanelShell
      entityType="Item"
      slug={itemSlug}
      title={data?.name}
      emptyMessage="Select an item to view details"
      isPending={isPending}
      isError={isError}
      onClose={onClose}
    >
      {data && (
        <>
          <ItemDetailContent data={data} franchise={franchise} />
          <div className="mt-6">
            <Link
              to="/catalog/$franchise/items/$slug"
              params={{ franchise, slug: data.slug }}
              className="text-sm text-primary hover:underline"
            >
              View full details &rarr;
            </Link>
          </div>
        </>
      )}
    </DetailPanelShell>
  );
}
