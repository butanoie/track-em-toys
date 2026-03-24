/**
 * Shared type definitions for seed data ingestion and sync.
 * Used by both ingest.ts and sync.ts.
 */

// ─── Reference table records ────────────────────────────────────────────────

export interface ReferenceRecord {
  slug: string
  name: string
  last_modified?: string
  [key: string]: unknown
}

export interface FranchiseRecord extends ReferenceRecord {
  sort_order: number | null
  notes: string | null
}

export interface ContinuityFamilyRecord extends ReferenceRecord {
  franchise_slug: string
  sort_order: number | null
  notes: string | null
}

export interface FactionRecord extends ReferenceRecord {
  franchise_slug: string
  notes: string | null
}

export interface SubGroupRecord extends ReferenceRecord {
  faction_slug: string | null
  franchise_slug: string
  notes: string | null
}

export interface ManufacturerRecord extends ReferenceRecord {
  is_official_licensee: boolean
  country: string | null
  website_url: string | null
  aliases: string[]
  notes: string | null
}

export interface ToyLineRecord extends ReferenceRecord {
  manufacturer_slug: string
  franchise_slug: string
  scale?: string | null
  description?: string | null
}

// ─── Entity records ─────────────────────────────────────────────────────────

export interface CharacterRecord {
  name: string
  slug: string
  franchise_slug: string
  faction_slug: string | null
  character_type: string | null
  alt_mode: string | null
  is_combined_form: boolean
  continuity_family_slug: string
  sub_group_slugs: string[]
  notes: string | null
  series_year?: string | null
  year_released?: number | null
  last_modified?: string
  [key: string]: unknown
}

export interface AppearanceRecord {
  slug: string
  name: string
  character_slug: string
  description: string | null
  source_media: string | null
  source_name: string | null
  year_start: number | null
  year_end: number | null
  metadata: Record<string, unknown>
  last_modified?: string
}

export interface ItemRecord {
  name: string
  slug: string
  product_code: string | null
  character_slug: string
  character_appearance_slug: string | null
  manufacturer_slug: string
  toy_line_slug: string
  is_third_party: boolean
  year_released: number | null
  size_class: string | null
  metadata: Record<string, unknown>
  last_modified?: string
}

// ─── Relationship records ───────────────────────────────────────────────────

export interface RelationshipEntity {
  slug: string
  role: string | null
}

export interface RelationshipRecord {
  type: string
  subtype: string | null
  entity1: RelationshipEntity
  entity2: RelationshipEntity
  metadata: Record<string, unknown>
  last_modified?: string
}

export interface ItemRelationshipRecord {
  type: string
  subtype: string | null
  item1_slug: string
  item1_role: string | null
  item2_slug: string
  item2_role: string | null
  metadata: Record<string, unknown>
  last_modified?: string
}

// ─── File wrappers ──────────────────────────────────────────────────────────

export interface ReferenceFile<T = ReferenceRecord> {
  _metadata: { total: number; [key: string]: unknown }
  data: T[]
}

export interface CharacterFile {
  _metadata: { total_characters: number; [key: string]: unknown }
  characters: CharacterRecord[]
}

export interface AppearanceFile {
  _metadata: { total: number; [key: string]: unknown }
  data: AppearanceRecord[]
}

export interface ItemFile {
  _metadata: { total_items: number; [key: string]: unknown }
  items: ItemRecord[]
}

export interface RelationshipFile {
  _metadata: { total: number; [key: string]: unknown }
  relationships: RelationshipRecord[]
}

export interface ItemRelationshipFile {
  _metadata: { total: number; [key: string]: unknown }
  item_relationships: ItemRelationshipRecord[]
}

// ─── Sync-specific types ────────────────────────────────────────────────────

/** Buffered timestamp update to write back to seed files after DB COMMIT. */
export interface TimestampStamp {
  filePath: string
  slug: string
  timestamp: string
}
