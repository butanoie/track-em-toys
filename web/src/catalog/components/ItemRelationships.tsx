import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useItemRelationships } from '@/catalog/hooks/useItemRelationships';
import { RelationshipSection } from '@/catalog/components/RelationshipSection';
import type { RelationshipGroup } from '@/catalog/components/RelationshipSection';
import { formatRelationshipType, groupByType, getGroupSubtype } from '@/catalog/lib/relationship-utils';

interface ItemRelationshipsProps {
  franchise: string;
  itemSlug: string;
}

export function ItemRelationships({ franchise, itemSlug }: ItemRelationshipsProps) {
  const { data } = useItemRelationships(franchise, itemSlug);

  const groups: RelationshipGroup[] = useMemo(() => {
    if (!data?.relationships.length) return [];
    const grouped = groupByType(data.relationships);
    return Array.from(grouped.entries()).map(([type, rels]) => {
      const groupSubtype = getGroupSubtype(rels);
      return {
        type,
        heading: formatRelationshipType(type),
        groupSubtype,
        items: rels.map((rel) => ({
          key: rel.related_item.slug,
          name: rel.related_item.name,
          role: rel.role,
          subtype: rel.subtype,
          renderLink: () => (
            <Link
              to="/catalog/$franchise/items/$slug"
              params={{ franchise, slug: rel.related_item.slug }}
              className="text-sm text-primary hover:underline"
            >
              {rel.related_item.name}
            </Link>
          ),
        })),
      };
    });
  }, [data, franchise]);

  return <RelationshipSection groups={groups} />;
}
