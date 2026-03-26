import { Badge } from '@/components/ui/badge';
import { useCharacterDetail } from '@/catalog/hooks/useCharacterDetail';
import { CharacterDetailContent } from '@/catalog/components/CharacterDetailContent';
import { DetailSheet } from '@/catalog/components/DetailSheet';
import { ShareLinkButton } from '@/catalog/components/ShareLinkButton';

interface CharacterDetailSheetProps {
  franchise: string;
  characterSlug: string | undefined;
  onClose: () => void;
}

export function CharacterDetailSheet({ franchise, characterSlug, onClose }: CharacterDetailSheetProps) {
  const { data, isPending, isError } = useCharacterDetail(franchise, characterSlug);

  return (
    <DetailSheet
      open={!!characterSlug}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      entityType="Character"
      title={data?.name}
      isPending={isPending}
      isError={isError}
      actions={<ShareLinkButton />}
      tags={
        data && (
          <>
            <Badge variant="secondary">{data.franchise.name}</Badge>
            <Badge variant="secondary">{data.continuity_family.name}</Badge>
            {data.is_combined_form && (
              <Badge
                variant="outline"
                className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
              >
                Combined Form
              </Badge>
            )}
          </>
        )
      }
    >
      {data && <CharacterDetailContent data={data} hideTags />}
    </DetailSheet>
  );
}
