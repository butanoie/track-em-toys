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
    >
      {data && <CharacterDetailContent data={data} />}
    </DetailSheet>
  );
}
