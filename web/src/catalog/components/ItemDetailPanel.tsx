import { useState } from 'react';
import { Camera } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { DetailPanelShell } from '@/catalog/components/DetailPanelShell';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';
import { PhotoManagementSheet } from '@/catalog/photos/PhotoManagementSheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';

interface ItemDetailPanelProps {
  franchise: string;
  itemSlug: string | undefined;
  onClose: () => void;
}

export function ItemDetailPanel({ franchise, itemSlug, onClose }: ItemDetailPanelProps) {
  const { user } = useAuth();
  const isCurator = user?.role === 'curator' || user?.role === 'admin';
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);

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
      actions={
        <>
          {isCurator && data && (
            <Button variant="ghost" size="icon" onClick={() => setPhotoSheetOpen(true)} aria-label="Manage photos">
              <Camera className="h-4 w-4" />
            </Button>
          )}
        </>
      }
    >
      {data && (
        <>
          <ItemDetailContent data={data} franchise={franchise} />
          {isCurator && data && (
            <PhotoManagementSheet
              open={photoSheetOpen}
              onOpenChange={setPhotoSheetOpen}
              franchise={franchise}
              itemSlug={data.slug}
              itemName={data.name}
              photos={data.photos}
            />
          )}
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
