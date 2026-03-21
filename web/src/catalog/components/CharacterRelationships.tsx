import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useCharacterRelationships } from '@/catalog/hooks/useCharacterRelationships';
import { RelationshipSection } from '@/catalog/components/RelationshipSection';
import type { RelationshipGroup } from '@/catalog/components/RelationshipSection';
import {
  formatRelationshipType,
  isRedundantCharacterRole,
  groupByType,
  getGroupSubtype,
} from '@/catalog/lib/relationship-utils';

interface CharacterRelationshipsProps {
  franchise: string;
  characterSlug: string;
}

export function CharacterRelationships({ franchise, characterSlug }: CharacterRelationshipsProps) {
  const { data } = useCharacterRelationships(franchise, characterSlug);

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
          key: rel.related_character.slug,
          name: rel.related_character.name,
          role: isRedundantCharacterRole(type, rel.role) ? null : rel.role,
          subtype: rel.subtype,
          renderLink: () => (
            <Link
              to="/catalog/$franchise/characters/$slug"
              params={{ franchise, slug: rel.related_character.slug }}
              className="text-sm text-primary hover:underline"
            >
              {rel.related_character.name}
            </Link>
          ),
        })),
      };
    });
  }, [data, franchise]);

  return <RelationshipSection groups={groups} />;
}
