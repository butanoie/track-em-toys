import { pool } from '../../db/pool.js';

export interface CharacterRelationshipRow {
  type: string;
  subtype: string | null;
  role: string | null;
  related_character: { slug: string; name: string };
  metadata: Record<string, unknown>;
}

export interface ItemRelationshipRow {
  type: string;
  subtype: string | null;
  role: string | null;
  related_item: { slug: string; name: string };
  metadata: Record<string, unknown>;
}

// Internal row type for the UNION ALL query
interface RelationshipQueryRow {
  type: string;
  subtype: string | null;
  role: string | null;
  related_slug: string;
  related_name: string;
  metadata: Record<string, unknown>;
}

/**
 * Get all relationships for a character (both directions).
 *
 * @param franchiseSlug - Franchise slug
 * @param characterSlug - Character slug within the franchise
 */
export async function getCharacterRelationships(
  franchiseSlug: string,
  characterSlug: string
): Promise<CharacterRelationshipRow[]> {
  const { rows } = await pool.query<RelationshipQueryRow>(
    `SELECT cr.type, cr.subtype, cr.entity2_role AS role,
            c2.slug AS related_slug, c2.name AS related_name, cr.metadata
       FROM character_relationships cr
       JOIN characters c1 ON c1.id = cr.entity1_id
       JOIN characters c2 ON c2.id = cr.entity2_id
       JOIN franchises fr ON fr.id = c1.franchise_id
      WHERE fr.slug = $1 AND c1.slug = $2
     UNION ALL
     SELECT cr.type, cr.subtype, cr.entity1_role AS role,
            c1.slug AS related_slug, c1.name AS related_name, cr.metadata
       FROM character_relationships cr
       JOIN characters c1 ON c1.id = cr.entity1_id
       JOIN characters c2 ON c2.id = cr.entity2_id
       JOIN franchises fr ON fr.id = c2.franchise_id
      WHERE fr.slug = $1 AND c2.slug = $2
     ORDER BY type ASC, related_name ASC`,
    [franchiseSlug, characterSlug]
  );
  return rows.map((r) => ({
    type: r.type,
    subtype: r.subtype,
    role: r.role,
    related_character: { slug: r.related_slug, name: r.related_name },
    metadata: r.metadata,
  }));
}

/**
 * Get all relationships for an item (both directions).
 *
 * @param franchiseSlug - Franchise slug
 * @param itemSlug - Item slug within the franchise
 */
export async function getItemRelationships(franchiseSlug: string, itemSlug: string): Promise<ItemRelationshipRow[]> {
  const { rows } = await pool.query<RelationshipQueryRow>(
    `SELECT ir.type, ir.subtype, ir.item2_role AS role,
            i2.slug AS related_slug, i2.name AS related_name, ir.metadata
       FROM item_relationships ir
       JOIN items i1 ON i1.id = ir.item1_id
       JOIN items i2 ON i2.id = ir.item2_id
       JOIN franchises fr ON fr.id = i1.franchise_id
      WHERE fr.slug = $1 AND i1.slug = $2
     UNION ALL
     SELECT ir.type, ir.subtype, ir.item1_role AS role,
            i1.slug AS related_slug, i1.name AS related_name, ir.metadata
       FROM item_relationships ir
       JOIN items i1 ON i1.id = ir.item1_id
       JOIN items i2 ON i2.id = ir.item2_id
       JOIN franchises fr ON fr.id = i2.franchise_id
      WHERE fr.slug = $1 AND i2.slug = $2
     ORDER BY type ASC, related_name ASC`,
    [franchiseSlug, itemSlug]
  );
  return rows.map((r) => ({
    type: r.type,
    subtype: r.subtype,
    role: r.role,
    related_item: { slug: r.related_slug, name: r.related_name },
    metadata: r.metadata,
  }));
}
