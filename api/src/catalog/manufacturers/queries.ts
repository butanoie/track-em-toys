import { pool } from '../../db/pool.js';

export interface ManufacturerRow {
  id: string;
  name: string;
  slug: string;
  is_official_licensee: boolean;
  country: string | null;
  website_url: string | null;
  aliases: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List all manufacturers ordered by name.
 */
export async function listManufacturers(): Promise<ManufacturerRow[]> {
  const { rows } = await pool.query<ManufacturerRow>(
    `SELECT id, name, slug, is_official_licensee, country, website_url,
            aliases, notes, created_at, updated_at
       FROM manufacturers
      ORDER BY name ASC`
  );
  return rows;
}

/**
 * Fetch a single manufacturer by slug.
 *
 * @param slug - Manufacturer slug to look up
 */
export async function getManufacturerBySlug(slug: string): Promise<ManufacturerRow | null> {
  const { rows } = await pool.query<ManufacturerRow>(
    `SELECT id, name, slug, is_official_licensee, country, website_url,
            aliases, notes, created_at, updated_at
       FROM manufacturers
      WHERE slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}
