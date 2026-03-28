import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { DetailField } from '@/catalog/components/DetailField';
import { AppearancesTable } from '@/catalog/components/AppearancesTable';
import { CharacterRelationships } from '@/catalog/components/CharacterRelationships';
import type { CharacterDetail, CatalogItem } from '@/lib/zod-schemas';

interface CharacterDetailContentProps {
  data: CharacterDetail;
  relatedItems?: CatalogItem[];
  relatedItemsCount?: number;
  hideTags?: boolean;
}

export function CharacterDetailContent({
  data,
  relatedItems,
  relatedItemsCount,
  hideTags,
}: CharacterDetailContentProps) {
  const franchise = data.franchise.slug;

  return (
    <>
      {!hideTags && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <DetailField label="Faction" value={data.faction?.name} />
        <DetailField label="Character Type" value={data.character_type} />

        <DetailField
          label="Sub-Groups"
          value={data.sub_groups.length > 0 ? data.sub_groups.map((sg) => sg.name).join(', ') : undefined}
        />
        <DetailField label="Alt Mode" value={data.alt_mode} />
      </dl>

      <CharacterRelationships franchise={franchise} characterSlug={data.slug} />

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">Appearances</h3>
        <AppearancesTable appearances={data.appearances} />
      </section>

      {relatedItems && relatedItems.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Related Items</h3>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {relatedItems.map((item) => (
              <li key={item.id}>
                <Link
                  to="/catalog/$franchise/items/$slug"
                  params={{ franchise, slug: item.slug }}
                  className="text-sm text-primary hover:underline"
                >
                  {item.name}
                </Link>
                {item.manufacturer && (
                  <span className="text-xs text-muted-foreground ml-1.5">({item.manufacturer.name})</span>
                )}
              </li>
            ))}
          </ul>
          {relatedItemsCount !== undefined && relatedItemsCount > relatedItems.length && (
            <Link
              to="/catalog/$franchise/items"
              params={{ franchise }}
              search={{ character: data.slug }}
              className="text-sm text-primary hover:underline mt-2 inline-block"
            >
              Browse all {relatedItemsCount} items &rarr;
            </Link>
          )}
        </section>
      )}
    </>
  );
}
