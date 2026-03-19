import { pool } from '../../db/pool.js';

export interface SearchResultRow {
  entity_type: 'character' | 'item';
  id: string;
  name: string;
  slug: string;
  franchise_slug: string;
  franchise_name: string;
  rank: number;
  character_slug: string | null;
  character_name: string | null;
  manufacturer_slug: string | null;
  manufacturer_name: string | null;
  toy_line_slug: string | null;
  toy_line_name: string | null;
  size_class: string | null;
  year_released: number | null;
  is_third_party: boolean | null;
  data_quality: string | null;
}

export interface SearchParams {
  query: string;
  franchiseSlug: string | null;
  limit: number;
  offset: number;
}

/**
 * Build a tsquery string with prefix matching on the last token.
 * "optimus pr" → 'optimus' & 'pr':*
 * "megatron" → 'megatron':*
 *
 * Tokens are split on whitespace. Each token except the last is an exact match.
 * The last token gets :* for prefix matching. All tokens are joined with &.
 * Returns null if the input produces no valid tokens.
 *
 * @param input - Raw user search string
 */
export function buildSearchTsquery(input: string): string | null {
  const tokens = input
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const parts = tokens.map((token, i) => {
    const escaped = token.replace(/'/g, "''");
    return i === tokens.length - 1 ? `'${escaped}':*` : `'${escaped}'`;
  });

  return parts.join(' & ');
}

/**
 * Full-text search across characters and items.
 *
 * @param params - Search query parameters
 */
export async function searchCatalog(params: SearchParams): Promise<{ rows: SearchResultRow[]; totalCount: number }> {
  const { query, franchiseSlug, limit, offset } = params;

  const tsqueryStr = buildSearchTsquery(query);
  if (!tsqueryStr) {
    return { rows: [], totalCount: 0 };
  }

  const dataQuery = `
    SELECT entity_type, id, name, slug, franchise_slug, franchise_name, rank,
           character_slug, character_name,
           manufacturer_slug, manufacturer_name,
           toy_line_slug, toy_line_name,
           size_class, year_released, is_third_party, data_quality
      FROM (
      SELECT 'character'::text AS entity_type,
             c.id, c.name, c.slug,
             fr.slug AS franchise_slug, fr.name AS franchise_name,
             ts_rank(c.search_vector, to_tsquery('simple', $1)) AS rank,
             NULL::text AS character_slug, NULL::text AS character_name,
             NULL::text AS manufacturer_slug, NULL::text AS manufacturer_name,
             NULL::text AS toy_line_slug, NULL::text AS toy_line_name,
             NULL::text AS size_class, NULL::integer AS year_released,
             NULL::boolean AS is_third_party, NULL::text AS data_quality
        FROM characters c
        JOIN franchises fr ON fr.id = c.franchise_id
       WHERE c.search_vector @@ to_tsquery('simple', $1)
         AND ($2::text IS NULL OR fr.slug = $2)

      UNION ALL

      SELECT 'item'::text AS entity_type,
             i.id, i.name, i.slug,
             fr.slug AS franchise_slug, fr.name AS franchise_name,
             ts_rank(i.search_vector, to_tsquery('simple', $1)) AS rank,
             ch.slug AS character_slug, ch.name AS character_name,
             mfr.slug AS manufacturer_slug, mfr.name AS manufacturer_name,
             tl.slug AS toy_line_slug, tl.name AS toy_line_name,
             i.size_class, i.year_released, i.is_third_party, i.data_quality
        FROM items i
        JOIN franchises fr ON fr.id = i.franchise_id
        JOIN characters ch ON ch.id = i.character_id
        LEFT JOIN manufacturers mfr ON mfr.id = i.manufacturer_id
        JOIN toy_lines tl ON tl.id = i.toy_line_id
       WHERE i.search_vector @@ to_tsquery('simple', $1)
         AND ($2::text IS NULL OR fr.slug = $2)
    ) results
    ORDER BY rank DESC, name ASC, entity_type ASC, id ASC
    LIMIT $3 OFFSET $4`;

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
    ) AS total_count`;

  const [dataResult, countResult] = await Promise.all([
    pool.query<SearchResultRow>(dataQuery, [tsqueryStr, franchiseSlug, limit, offset]),
    pool.query<{ total_count: number }>(countQuery, [tsqueryStr, franchiseSlug]),
  ]);

  return {
    rows: dataResult.rows,
    totalCount: countResult.rows[0]?.total_count ?? 0,
  };
}
