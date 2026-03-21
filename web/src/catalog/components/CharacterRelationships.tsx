import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { useCharacterRelationships } from '@/catalog/hooks/useCharacterRelationships';
import { RelationshipSection } from '@/catalog/components/RelationshipSection';
import type { RelationshipGroup, RelationshipGroupItem } from '@/catalog/components/RelationshipSection';
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

  const gestaltRef = useMemo(() => {
    const rel = data?.relationships.find(
      (r) => r.type === 'combiner-component' && r.role === 'gestalt',
    );
    return rel ? rel.related_character : undefined;
  }, [data]);

  // Secondary fetch for the gestalt's relationships (to get all sibling components).
  // The hook's enabled guard suppresses this when gestaltRef is undefined.
  const { data: gestaltData } = useCharacterRelationships(franchise, gestaltRef?.slug);

  const groups: RelationshipGroup[] = useMemo(() => {
    if (!data?.relationships.length) return [];

    const makeCharacterLink = (slug: string, name: string) => () => (
      <Link
        to="/catalog/$franchise/characters/$slug"
        params={{ franchise, slug }}
        className="text-sm text-primary hover:underline"
      >
        {name}
      </Link>
    );

    const toItem = (type: string, rel: (typeof data.relationships)[number], isCurrent?: boolean) => ({
      key: rel.related_character.slug,
      name: rel.related_character.name,
      role: isRedundantCharacterRole(type, rel.role) ? null : rel.role,
      subtype: rel.subtype,
      isCurrent,
      renderLink: makeCharacterLink(rel.related_character.slug, rel.related_character.name),
    });

    const grouped = groupByType(data.relationships);
    const result: RelationshipGroup[] = [];

    for (const [type, rels] of grouped.entries()) {
      if (type === 'combiner-component' && gestaltRef) {
        // Build the expanded combiner group with sibling components
        const siblings = gestaltData?.relationships.filter(
          (r) => r.type === 'combiner-component',
        );

        // Use siblings from secondary fetch if available, otherwise fall back to
        // the primary data (gestalt-only entry) while the secondary fetch loads
        const sourceRels = siblings?.length ? siblings : rels;

        const items: RelationshipGroupItem[] = [...sourceRels]
          .sort((a, b) => a.related_character.name.localeCompare(b.related_character.name))
          .map((rel) => toItem(type, rel, rel.related_character.slug === characterSlug));

        result.push({
          type,
          heading: gestaltRef.name,
          groupSubtype: getGroupSubtype(sourceRels),
          renderHeading: () => (
            <Link
              to="/catalog/$franchise/characters/$slug"
              params={{ franchise, slug: gestaltRef.slug }}
              className="hover:underline"
            >
              {gestaltRef.name}
            </Link>
          ),
          items,
        });
      } else {
        result.push({
          type,
          heading: formatRelationshipType(type),
          groupSubtype: getGroupSubtype(rels),
          items: rels.map((rel) => toItem(type, rel)),
        });
      }
    }

    return result;
  }, [data, gestaltRef, gestaltData, franchise, characterSlug]);

  return <RelationshipSection groups={groups} />;
}
