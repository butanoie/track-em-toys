import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { DetailField } from '@/catalog/components/DetailField';
import { AppearancesTable } from '@/catalog/components/AppearancesTable';
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

        {data.is_combined_form && data.component_characters.length > 0 && (
          <DetailField label="Component Characters">
            <ul className="space-y-1">
              {data.component_characters.map((comp) => (
                <li key={comp.slug} className="text-sm">
                  <Link
                    to="/catalog/$franchise/characters/$slug"
                    params={{ franchise, slug: comp.slug }}
                    className="text-primary hover:underline"
                  >
                    {comp.name}
                  </Link>
                  {(comp.combiner_role || comp.alt_mode) && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({[comp.combiner_role, comp.alt_mode].filter(Boolean).join(' · ')})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </DetailField>
        )}

        {data.combiner_role && <DetailField label="Combiner Role" value={data.combiner_role} />}

        {data.combined_form && (
          <DetailField label="Combined Form">
            <Link
              to="/catalog/$franchise/characters/$slug"
              params={{ franchise, slug: data.combined_form.slug }}
              className="text-primary hover:underline"
            >
              {data.combined_form.name}
            </Link>
          </DetailField>
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
