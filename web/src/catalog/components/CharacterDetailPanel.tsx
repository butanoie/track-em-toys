import { Link } from '@tanstack/react-router';
import { useCharacterDetail } from '@/catalog/hooks/useCharacterDetail';
import { DetailPanelShell } from '@/catalog/components/DetailPanelShell';
import { CharacterDetailContent } from '@/catalog/components/CharacterDetailContent';

interface CharacterDetailPanelProps {
  franchise: string;
  characterSlug: string | undefined;
  onClose: () => void;
}

export function CharacterDetailPanel({ franchise, characterSlug, onClose }: CharacterDetailPanelProps) {
  const { data, isPending, isError } = useCharacterDetail(franchise, characterSlug);

  return (
    <DetailPanelShell
      entityType="Character"
      slug={characterSlug}
      title={data?.name}
      emptyMessage="Select a result to view details"
      isPending={isPending}
      isError={isError}
      onClose={onClose}
    >
      {data && (
        <>
          <CharacterDetailContent data={data} />
          <div className="mt-6">
            <Link
              to="/catalog/$franchise/characters/$slug"
              params={{ franchise, slug: data.slug }}
              className="text-sm text-primary hover:underline"
            >
              View full profile &rarr;
            </Link>
          </div>
        </>
      )}
    </DetailPanelShell>
  );
}
