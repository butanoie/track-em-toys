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
}

export function CharacterDetailContent({ data, relatedItems, relatedItemsCount }: CharacterDetailContentProps) {
  const franchise = data.franchise.slug;

  return (
    <>
      <dl className="space-y-3">
        <DetailField label="Franchise" value={data.franchise.name} />
        {data.faction && <DetailField label="Faction" value={data.faction.name} />}
        <DetailField label="Continuity" value={data.continuity_family.name} />
        <DetailField label="Character Type" value={data.character_type} />
        <DetailField label="Alt Mode" value={data.alt_mode} />

        {data.is_combined_form && (
          <div>
            <Badge
              variant="outline"
              className="border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300"
            >
              Combined Form
            </Badge>
          </div>
        )}
      </dl>

      {data.sub_groups.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Sub-Groups</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.sub_groups.map((sg) => (
              <Badge key={sg.slug} variant="secondary">
                {sg.name}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <CharacterRelationships franchise={franchise} characterSlug={data.slug} />

      <section className="mt-6">
        <h3 className="text-sm font-semibold text-foreground mb-2">Appearances</h3>
        <AppearancesTable appearances={data.appearances} />
      </section>

      {relatedItems && relatedItems.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-foreground mb-2">Related Items</h3>
          <ul className="space-y-1.5">
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
