import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { useItemDetail } from '@/catalog/hooks/useItemDetail';
import { useCharacterDetail } from '@/catalog/hooks/useCharacterDetail';
import { ItemDetailContent } from '@/catalog/components/ItemDetailContent';
import { CharacterDetailContent } from '@/catalog/components/CharacterDetailContent';
import { DetailSheet } from '@/catalog/components/DetailSheet';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';
import { dataQualityStyle } from '@/catalog/components/data-quality-style';
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

  const primaryCharacter = data?.characters.find((c) => c.is_primary) ?? data?.characters[0];
  const { data: characterData } = useCharacterDetail(franchise, primaryCharacter?.slug);

  const sheetTitle = data ? (data.product_code ? `${data.name} [${data.product_code}]` : data.name) : undefined;
  const sheetSubtitle = primaryCharacter?.name;

  const itemIds = useMemo(() => (data?.id ? [data.id] : []), [data?.id]);
  const { data: checkData } = useCollectionCheck(itemIds);
  const checkEntry = data?.id ? checkData?.items[data.id] : undefined;
  const collectionCount = checkEntry?.count ?? 0;
  const collectionMutations = useCollectionMutations();

  return (
    <DetailSheet
      open={!!itemSlug}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      entityType="Item"
      title={sheetTitle}
      subtitle={sheetSubtitle}
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
      tags={
        data && (
          <>
            <Badge variant="outline" className={dataQualityStyle(data.data_quality)}>
              {data.data_quality
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
            {data.is_third_party && (
              <Badge
                variant="outline"
                className="border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300"
              >
                Third Party
              </Badge>
            )}
          </>
        )
      }
      tagAction={
        data && (
          <div className="flex items-center gap-3">
            {collectionCount > 0 && (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
              >
                In Collection ({collectionCount})
              </Badge>
            )}
            <AddToCollectionButton
              item={{ id: data.id, name: data.name }}
              checkResult={checkEntry}
              mutations={collectionMutations}
            />
          </div>
        )
      }
    >
      {data && (
        <>
          <ItemDetailContent data={data} franchise={franchise} />

          {characterData && (
            <>
              <Separator className="my-6" />
              <section>
                <h3 className="text-lg font-semibold text-foreground">
                  <Link
                    to="/catalog/$franchise/characters/$slug"
                    params={{ franchise, slug: characterData.slug }}
                    className="text-primary hover:underline"
                  >
                    {characterData.name}
                  </Link>
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 mb-4">
                  <Badge variant="secondary">{characterData.franchise.name}</Badge>
                  <Badge variant="secondary">{characterData.continuity_family.name}</Badge>
                  {characterData.is_combined_form && (
                    <Badge
                      variant="outline"
                      className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
                    >
                      Combined Form
                    </Badge>
                  )}
                </div>
                <CharacterDetailContent data={characterData} hideTags />
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
