import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { useCharacterDetail } from '@/catalog/hooks/useCharacterDetail';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';
import { CharacterDetailContent } from '@/catalog/components/CharacterDetailContent';
import { DetailSheet } from '@/catalog/components/DetailSheet';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';
import { PhotoManagementSheet } from '@/catalog/photos/PhotoManagementSheet';
import { AddToCollectionButton } from '@/collection/components/AddToCollectionButton';
import { useCollectionCheck } from '@/collection/hooks/useCollectionCheck';
import { useCollectionMutations } from '@/collection/hooks/useCollectionMutations';
import { useAuth } from '@/auth/useAuth';

interface ItemDetailSheetProps {
  franchise: string;
  itemSlug: string | undefined;
  onClose: () => void;
}

export function ItemDetailSheet({ franchise, itemSlug, onClose }: ItemDetailSheetProps) {
  const { user } = useAuth();
  const isCurator = user?.role === 'curator' || user?.role === 'admin';
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);

  const { data, isPending, isError } = useItemDetail(franchise, itemSlug);

  const primaryCharacterSlug = data?.characters.find((c) => c.is_primary)?.slug ?? data?.characters[0]?.slug;
  const { data: characterData } = useCharacterDetail(franchise, primaryCharacterSlug);

  const itemIds = useMemo(() => (data?.id ? [data.id] : []), [data?.id]);
  const { data: checkData } = useCollectionCheck(itemIds);
  const checkEntry = data?.id ? checkData?.items[data.id] : undefined;
  const collectionMutations = useCollectionMutations();

  return (
    <DetailSheet
      open={!!itemSlug}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      entityType="Item"
      title={data?.name}
      isPending={isPending}
      isError={isError}
      actions={
        <>
          {isCurator && data && (
            <Button variant="ghost" size="icon" onClick={() => setPhotoSheetOpen(true)} aria-label="Manage photos">
              <Camera className="h-4 w-4" />
            </Button>
          )}
          <ShareLinkButton />
        </>
      }
    >
      {data && (
        <>
          <ItemDetailContent data={data} franchise={franchise} />

          <div className="mt-4">
            <AddToCollectionButton
              item={{ id: data.id, name: data.name }}
              checkResult={checkEntry}
              mutations={collectionMutations}
            />
          </div>

          {characterData && (
            <>
              <Separator className="my-6" />
              <section>
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  <Link
                    to="/catalog/$franchise/characters/$slug"
                    params={{ franchise, slug: characterData.slug }}
                    className="text-primary hover:underline"
                  >
                    {characterData.name}
                  </Link>
                </h3>
                <CharacterDetailContent data={characterData} />
              </section>
            </>
          )}

          {isCurator && (
            <PhotoManagementSheet
              open={photoSheetOpen}
              onOpenChange={setPhotoSheetOpen}
              franchise={franchise}
              itemSlug={data.slug}
              itemName={data.name}
              photos={data.photos}
            />
          )}
        </>
      )}
    </DetailSheet>
  );
}
