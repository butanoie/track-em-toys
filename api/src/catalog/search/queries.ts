import { pool } from '../../db/pool.js'

export interface SearchResultRow {
  entity_type: 'character' | 'item'
  id: string
  name: string
  slug: string
  franchise_slug: string
  franchise_name: string
  rank: number
}

export interface SearchParams {
  query: string
  franchiseSlug: string | null
  limit: number
  offset: number
}

/**
 * Build a tsquery string with prefix matching on the last token.
 * "optimus pr" → 'optimus' & 'pr':*
 * "megatron" → 'megatron':*
 *
 * Tokens are split on whitespace. Each token except the last is an exact match.
 * The last token gets :* for prefix matching. All tokens are joined with &.
 * Returns null if the input produces no valid tokens.
 */
export function buildSearchTsquery(input: string): string | null {
  const tokens = input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return null

  const parts = tokens.map((token, i) => {
    const escaped = token.replace(/'/g, "''")
    return i === tokens.length - 1 ? `'${escaped}':*` : `'${escaped}'`
  })

  return parts.join(' & ')
}

export async function searchCatalog(
  params: SearchParams,
): Promise<{ rows: SearchResultRow[]; totalCount: number }> {
  const { query, franchiseSlug, limit, offset } = params

  const tsqueryStr = buildSearchTsquery(query)
  if (!tsqueryStr) {
    return { rows: [], totalCount: 0 }
  }

  const dataQuery = `
    SELECT entity_type, id, name, slug, franchise_slug, franchise_name, rank FROM (
      SELECT 'character'::text AS entity_type,
             c.id, c.name, c.slug,
             fr.slug AS franchise_slug, fr.name AS franchise_name,
             ts_rank(c.search_vector, to_tsquery('simple', $1)) AS rank
        FROM characters c
        JOIN franchises fr ON fr.id = c.franchise_id
       WHERE c.search_vector @@ to_tsquery('simple', $1)
         AND ($2::text IS NULL OR fr.slug = $2)

      UNION ALL

      SELECT 'item'::text AS entity_type,
             i.id, i.name, i.slug,
             fr.slug AS franchise_slug, fr.name AS franchise_name,
             ts_rank(i.search_vector, to_tsquery('simple', $1)) AS rank
        FROM items i
        JOIN franchises fr ON fr.id = i.franchise_id
       WHERE i.search_vector @@ to_tsquery('simple', $1)
         AND ($2::text IS NULL OR fr.slug = $2)
    ) results
    ORDER BY rank DESC, name ASC, entity_type ASC, id ASC
    LIMIT $3 OFFSET $4`

  const countQuery = `
    SELECT (
      (SELECT COUNT(*)::int
         FROM characters c
         JOIN franchises fr ON fr.id = c.franchise_id
        WHERE c.search_vector @@ to_tsquery('simple', $1)
          AND ($2::text IS NULL OR fr.slug = $2))
      +
      (SELECT COUNT(*)::int
         FROM items i
         JOIN franchises fr ON fr.id = i.franchise_id
        WHERE i.search_vector @@ to_tsquery('simple', $1)
          AND ($2::text IS NULL OR fr.slug = $2))
    ) AS total_count`

  const [dataResult, countResult] = await Promise.all([
    pool.query<SearchResultRow>(dataQuery, [tsqueryStr, franchiseSlug, limit, offset]),
    pool.query<{ total_count: number }>(countQuery, [tsqueryStr, franchiseSlug]),
  ])

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  }
}
