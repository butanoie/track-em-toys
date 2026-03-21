import { pool } from '../../db/pool.js';

export interface FranchiseRow {
  id: string;
  slug: string;
  name: string;
  sort_order: number | null;
  notes: string | null;
  created_at: string;
}

/**
 * List all franchises ordered by sort order.
 */
export async function listFranchises(): Promise<FranchiseRow[]> {
  const { rows } = await pool.query<FranchiseRow>(
    `SELECT id, slug, name, sort_order, notes, created_at
       FROM franchises
      ORDER BY sort_order ASC NULLS LAST, name ASC`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Stats (aggregate counts per franchise)
// ---------------------------------------------------------------------------

export interface FranchiseStatsRow {
  slug: string;
  name: string;
  sort_order: number | null;
  notes: string | null;
  item_count: number;
  continuity_family_count: number;
  manufacturer_count: number;
}

/**
 * List all franchises with aggregate item/CF/manufacturer counts.
 *
 * Uses a single GROUP BY query. JOINs through items → item_character_depictions →
 * character_appearances → characters → continuity_families.
 */
export async function listFranchiseStats(): Promise<FranchiseStatsRow[]> {
  const { rows } = await pool.query<FranchiseStatsRow>(
    `SELECT fr.slug, fr.name, fr.sort_order, fr.notes,
            COUNT(DISTINCT i.id)::int AS item_count,
            COUNT(DISTINCT cf.id)::int AS continuity_family_count,
            COUNT(DISTINCT i.manufacturer_id)::int AS manufacturer_count
       FROM franchises fr
       LEFT JOIN items i ON i.franchise_id = fr.id
       LEFT JOIN item_character_depictions icd ON icd.item_id = i.id AND icd.is_primary = true
       LEFT JOIN character_appearances ca ON ca.id = icd.appearance_id
       LEFT JOIN characters ch ON ch.id = ca.character_id
       LEFT JOIN continuity_families cf ON cf.id = ch.continuity_family_id
      GROUP BY fr.id, fr.slug, fr.name, fr.sort_order, fr.notes
      ORDER BY fr.sort_order ASC NULLS LAST, fr.name ASC`
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Fetch a single franchise by slug.
 *
 * @param slug - Franchise slug to look up
 */
export async function getFranchiseBySlug(slug: string): Promise<FranchiseRow | null> {
  const { rows } = await pool.query<FranchiseRow>(
    `SELECT id, slug, name, sort_order, notes, created_at
       FROM franchises
      WHERE slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}
