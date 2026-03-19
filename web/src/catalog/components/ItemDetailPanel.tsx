import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { DetailPanelShell } from '@/catalog/components/DetailPanelShell';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';

interface ItemDetailPanelProps {
  franchise: string;
  itemSlug: string | undefined;
  onClose: () => void;
}

export function ItemDetailPanel({ franchise, itemSlug, onClose }: ItemDetailPanelProps) {
  const { data, isPending, isError } = useItemDetail(franchise, itemSlug);

  const shareUrl = data
    ? `${window.location.origin}/catalog/${encodeURIComponent(franchise)}/items/${encodeURIComponent(data.slug)}`
    : undefined;

  return (
    <DetailPanelShell
      entityType="Item"
      slug={itemSlug}
      title={data?.name}
      emptyMessage="Select an item to view details"
      isPending={isPending}
      isError={isError}
      onClose={onClose}
      actions={shareUrl ? <ShareLinkButton url={shareUrl} /> : undefined}
    >
      {data && <ItemDetailContent data={data} franchise={franchise} />}
    </DetailPanelShell>
  );
}
