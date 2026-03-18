import { pool } from '../../db/pool.js';

export interface ToyLineRow {
  id: string;
  name: string;
  slug: string;
  franchise_slug: string;
  franchise_name: string;
  manufacturer_slug: string;
  manufacturer_name: string;
  scale: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List toy lines for a franchise.
 *
 * @param franchiseSlug - Franchise slug filter
 */
export async function listToyLines(franchiseSlug: string): Promise<ToyLineRow[]> {
  const { rows } = await pool.query<ToyLineRow>(
    `SELECT tl.id, tl.name, tl.slug,
            tl.scale, tl.description, tl.created_at, tl.updated_at,
            fr.slug AS franchise_slug, fr.name AS franchise_name,
            mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name
       FROM toy_lines tl
       JOIN franchises fr ON fr.id = tl.franchise_id
       JOIN manufacturers mfr ON mfr.id = tl.manufacturer_id
      WHERE fr.slug = $1
      ORDER BY tl.name ASC`,
    [franchiseSlug]
  );
  return rows;
}

/**
 * Fetch a single toy line by franchise and slug.
 *
 * @param franchiseSlug - Franchise slug filter
 * @param toyLineSlug - Toy line slug to look up
 */
export async function getToyLineBySlug(franchiseSlug: string, toyLineSlug: string): Promise<ToyLineRow | null> {
  const { rows } = await pool.query<ToyLineRow>(
    `SELECT tl.id, tl.name, tl.slug,
            tl.scale, tl.description, tl.created_at, tl.updated_at,
            fr.slug AS franchise_slug, fr.name AS franchise_name,
            mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name
       FROM toy_lines tl
       JOIN franchises fr ON fr.id = tl.franchise_id
       JOIN manufacturers mfr ON mfr.id = tl.manufacturer_id
      WHERE fr.slug = $1 AND tl.slug = $2`,
    [franchiseSlug, toyLineSlug]
  );
  return rows[0] ?? null;
}
