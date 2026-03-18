import { pool } from '../../db/pool.js'

export interface FranchiseRow {
  id: string
  slug: string
  name: string
  sort_order: number | null
  notes: string | null
  created_at: string
}

export async function listFranchises(): Promise<FranchiseRow[]> {
  const { rows } = await pool.query<FranchiseRow>(
    `SELECT id, slug, name, sort_order, notes, created_at
       FROM franchises
      ORDER BY sort_order ASC NULLS LAST, name ASC`,
  )
  return rows
}

export async function getFranchiseBySlug(slug: string): Promise<FranchiseRow | null> {
  const { rows } = await pool.query<FranchiseRow>(
    `SELECT id, slug, name, sort_order, notes, created_at
       FROM franchises
      WHERE slug = $1`,
    [slug],
  )
  return rows[0] ?? null
}
