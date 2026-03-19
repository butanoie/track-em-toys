import type { ItemListRow, ItemDetail } from '../items/queries.js';

/**
 * Format an item row for list responses.
 *
 * @param row - Database row to format
 */
export function formatListItem(row: ItemListRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    franchise: { slug: row.franchise_slug, name: row.franchise_name },
    character: { slug: row.character_slug, name: row.character_name },
    manufacturer: row.manufacturer_slug ? { slug: row.manufacturer_slug, name: row.manufacturer_name! } : null,
    toy_line: { slug: row.toy_line_slug, name: row.toy_line_name },
    size_class: row.size_class,
    year_released: row.year_released,
    is_third_party: row.is_third_party,
    data_quality: row.data_quality,
  };
}

/**
 * Format an item detail for the detail response.
 *
 * @param detail - Item detail to format
 */
export function formatDetail(detail: ItemDetail) {
  const { base, photos } = detail;
  return {
    ...formatListItem(base),
    appearance: base.appearance_slug
      ? {
          slug: base.appearance_slug,
          name: base.appearance_name!,
          source_media: base.appearance_source_media,
          source_name: base.appearance_source_name,
        }
      : null,
    description: base.description,
    barcode: base.barcode,
    sku: base.sku,
    product_code: base.product_code,
    photos,
    metadata: base.metadata,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}
