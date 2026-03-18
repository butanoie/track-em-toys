/**
 * Interactive Database Schema Diagrams for Track'em Toys
 *
 * This is a standalone React component that renders interactive ER diagrams
 * for the PostgreSQL schema (web architecture) and SwiftData models (iOS).
 *
 * How to view:
 *   1. Paste into https://codesandbox.io or https://stackblitz.com (React template)
 *   2. Or render locally: create a React app, import this component, and mount it
 *   3. The component is self-contained — no external dependencies beyond React
 *
 * Exports a default component that renders both schema views with interactive
 * table expansion, type-colored columns, and relationship indicators.
 */
import { useState } from 'react';

const COLORS = {
  bg: '#0a0e17',
  surface: '#111827',
  surfaceHover: '#1a2235',
  border: '#1e293b',
  borderActive: '#3b82f6',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: '#3b82f6',
  accentLight: '#60a5fa',
  pk: '#f59e0b',
  fk: '#a78bfa',
  bool: '#34d399',
  enum: '#fb7185',
  text_type: '#38bdf8',
  number: '#fbbf24',
  date: '#c084fc',
  json: '#22d3ee',
  shared: '#10b981',
  private: '#f43f5e',
  reference: '#8b5cf6',
  native: '#06b6d4',
};

const schemas = {
  web: {
    label: 'Web Architecture — PostgreSQL',
    sublabel: 'Shared catalog + private collections with Row-Level Security',
    groups: [
      {
        name: 'Shared Catalog',
        color: COLORS.shared,
        desc: 'Community-readable reference data (no user_id)',
        tables: [
          {
            name: 'franchises',
            desc: 'Top-level franchise groupings (Transformers, G.I. Joe, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'sort_order', type: 'INT', color: COLORS.number },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'factions',
            desc: 'Canonical factions/allegiances (Autobot, Decepticon, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'franchise_id', type: 'UUID', constraint: 'FK → franchises RESTRICT NOT NULL', color: COLORS.fk },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'sub_groups',
            desc: 'Named sub-teams (Dinobots, Constructicons, Aerialbots, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'faction_id', type: 'UUID', constraint: 'FK → factions SET NULL', color: COLORS.fk },
              { name: 'franchise_id', type: 'UUID', constraint: 'FK → franchises RESTRICT NOT NULL', color: COLORS.fk },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'continuity_families',
            desc: 'Continuity groupings (G1, Beast Era, Unicron Trilogy, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'franchise_id', type: 'UUID', constraint: 'FK → franchises RESTRICT NOT NULL', color: COLORS.fk },
              { name: 'sort_order', type: 'INT', color: COLORS.number },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'characters',
            desc: 'Franchise characters (Optimus Prime, Snake Eyes, Spike, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'franchise_id', type: 'UUID', constraint: 'FK → franchises RESTRICT NOT NULL', color: COLORS.fk },
              { name: 'faction_id', type: 'UUID', constraint: 'FK → factions SET NULL', color: COLORS.fk },
              {
                name: 'character_type',
                type: 'TEXT',
                constraint: 'Transformer|Human|Quintesson|...',
                color: COLORS.enum,
              },
              { name: 'alt_mode', type: 'TEXT', constraint: 'e.g. semi-truck, F-15 jet', color: COLORS.text_type },
              { name: 'is_combined_form', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              {
                name: 'combined_form_id',
                type: 'UUID',
                constraint: 'FK → characters (self) SET NULL',
                color: COLORS.fk,
              },
              { name: 'combiner_role', type: 'TEXT', constraint: 'torso|right arm|left arm|...', color: COLORS.enum },
              {
                name: 'continuity_family_id',
                type: 'UUID',
                constraint: 'FK → continuity_families RESTRICT NOT NULL',
                color: COLORS.fk,
              },
              { name: 'metadata', type: 'JSONB', constraint: "DEFAULT '{}'", color: COLORS.json },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
            indexes: ['UNIQUE (lower(name), franchise_id, continuity_family_id)'],
          },
          {
            name: 'character_sub_groups',
            desc: 'Many-to-many: characters ↔ sub_groups',
            fields: [
              { name: 'character_id', type: 'UUID', constraint: 'PK, FK → characters CASCADE', color: COLORS.fk },
              { name: 'sub_group_id', type: 'UUID', constraint: 'PK, FK → sub_groups CASCADE', color: COLORS.fk },
            ],
          },
          {
            name: 'character_appearances',
            desc: 'A character as depicted in a specific media source',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'character_id', type: 'UUID', constraint: 'FK → characters CASCADE NOT NULL', color: COLORS.fk },
              { name: 'description', type: 'TEXT', color: COLORS.text_type },
              {
                name: 'source_media',
                type: 'TEXT',
                constraint: 'TV|Comic|Movie|OVA|Toy-only|Video Game|Manga',
                color: COLORS.enum,
              },
              { name: 'source_name', type: 'TEXT', color: COLORS.text_type },
              { name: 'year_start', type: 'INT', color: COLORS.number },
              { name: 'year_end', type: 'INT', color: COLORS.number },
              { name: 'metadata', type: 'JSONB', constraint: "DEFAULT '{}'", color: COLORS.json },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'manufacturers',
            desc: 'Companies that produce figures',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'is_official_licensee', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'country', type: 'TEXT', color: COLORS.text_type },
              { name: 'website_url', type: 'VARCHAR(500)', color: COLORS.text_type },
              { name: 'aliases', type: 'TEXT[]', constraint: "DEFAULT '{}'", color: COLORS.json },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'toy_lines',
            desc: 'Product lines / series (Masterpiece, Classified, etc.)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'franchise_id', type: 'UUID', constraint: 'FK → franchises RESTRICT NOT NULL', color: COLORS.fk },
              { name: 'manufacturer_id', type: 'UUID', constraint: 'FK → manufacturers', color: COLORS.fk },
              { name: 'scale', type: 'VARCHAR(50)', color: COLORS.text_type },
              { name: 'description', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'items',
            desc: 'Master catalog of all known toy figures',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'slug', type: 'TEXT', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'name', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'manufacturer_id', type: 'UUID', constraint: 'FK → manufacturers', color: COLORS.fk },
              { name: 'character_id', type: 'UUID', constraint: 'FK → characters', color: COLORS.fk },
              { name: 'toy_line_id', type: 'UUID', constraint: 'FK → toy_lines', color: COLORS.fk },
              { name: 'year_released', type: 'INTEGER', color: COLORS.number },
              { name: 'description', type: 'TEXT', color: COLORS.text_type },
              { name: 'barcode', type: 'TEXT', color: COLORS.text_type },
              { name: 'sku', type: 'TEXT', color: COLORS.text_type },
              { name: 'product_code', type: 'TEXT', constraint: 'e.g. MP-44, FT-44', color: COLORS.text_type },
              { name: 'is_third_party', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'created_by', type: 'UUID', constraint: 'FK → users', color: COLORS.fk },
              {
                name: 'data_quality',
                type: 'TEXT',
                constraint: 'CHECK needs_review|verified|community_verified',
                color: COLORS.enum,
              },
              {
                name: 'character_appearance_id',
                type: 'UUID',
                constraint: 'FK → character_appearances SET NULL',
                color: COLORS.fk,
              },
              {
                name: 'size_class',
                type: 'TEXT',
                constraint: 'Core|Deluxe|Voyager|Leader|Commander|Titan|...',
                color: COLORS.enum,
              },
              { name: 'metadata', type: 'JSONB', constraint: "DEFAULT '{}'", color: COLORS.json },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'item_photos',
            desc: 'Reference photos for catalog items',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'item_id', type: 'UUID', constraint: 'FK → items CASCADE', color: COLORS.fk },
              { name: 'url', type: 'TEXT', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'caption', type: 'TEXT', color: COLORS.text_type },
              { name: 'uploaded_by', type: 'UUID', constraint: 'FK → users', color: COLORS.fk },
              { name: 'is_primary', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'catalog_edits',
            desc: 'Approval queue for community contributions',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'item_id', type: 'UUID', constraint: 'FK → items', color: COLORS.fk },
              { name: 'editor_id', type: 'UUID', constraint: 'FK → users NOT NULL', color: COLORS.fk },
              { name: 'edit_type', type: 'TEXT', constraint: 'CHECK create|update|merge|delete', color: COLORS.enum },
              { name: 'data_before', type: 'JSONB', color: COLORS.json },
              { name: 'data_after', type: 'JSONB', constraint: 'NOT NULL', color: COLORS.json },
              {
                name: 'status',
                type: 'TEXT',
                constraint: 'CHECK pending|approved|rejected|auto_approved',
                color: COLORS.enum,
              },
              { name: 'reviewed_by', type: 'UUID', constraint: 'FK → users', color: COLORS.fk },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
        ],
      },
      {
        name: 'Private Collections',
        color: COLORS.private,
        desc: 'Per-user data isolated by Row-Level Security (RLS)',
        tables: [
          {
            name: 'user_collection_items',
            desc: 'Bridge: links user → catalog item with private metadata',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'user_id', type: 'UUID', constraint: 'FK → users CASCADE', color: COLORS.fk },
              { name: 'item_id', type: 'UUID', constraint: 'FK → items CASCADE', color: COLORS.fk },
              {
                name: 'condition',
                type: 'ENUM',
                constraint: 'mint|near_mint|excellent|good|fair|poor',
                color: COLORS.enum,
              },
              { name: 'acquisition_price', type: 'NUMERIC(12,2)', color: COLORS.number },
              { name: 'acquisition_source', type: 'TEXT', color: COLORS.text_type },
              { name: 'acquisition_date', type: 'DATE', color: COLORS.date },
              { name: 'quantity', type: 'INTEGER', constraint: 'DEFAULT 1', color: COLORS.number },
              { name: 'is_for_sale', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'asking_price', type: 'NUMERIC(12,2)', color: COLORS.number },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'metadata_json', type: 'JSONB', color: COLORS.json },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
            indexes: ['UNIQUE (user_id, item_id)'],
          },
          {
            name: 'user_pricing_records',
            desc: 'Observed resale prices (user_id denormalized for RLS)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              {
                name: 'user_collection_item_id',
                type: 'UUID',
                constraint: 'FK → user_collection_items CASCADE',
                color: COLORS.fk,
              },
              { name: 'user_id', type: 'UUID', constraint: 'FK → users (denormalized for RLS)', color: COLORS.fk },
              {
                name: 'price_type',
                type: 'ENUM',
                constraint: 'MSRP|resale_listing|resale_sold|appraisal|insurance',
                color: COLORS.enum,
              },
              { name: 'amount', type: 'NUMERIC(12,2)', constraint: 'NOT NULL', color: COLORS.number },
              { name: 'currency', type: 'CHAR(3)', constraint: 'ISO 4217', color: COLORS.text_type },
              { name: 'source_platform', type: 'VARCHAR(100)', color: COLORS.text_type },
              { name: 'source_url', type: 'VARCHAR(1000)', color: COLORS.text_type },
              { name: 'listing_date', type: 'DATE', color: COLORS.date },
              { name: 'is_sold', type: 'BOOLEAN', color: COLORS.bool },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'recorded_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'user_wantlist',
            desc: 'Items the collector wants to acquire',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'user_id', type: 'UUID', constraint: 'FK → users CASCADE', color: COLORS.fk },
              { name: 'item_id', type: 'UUID', constraint: 'FK → items CASCADE', color: COLORS.fk },
              { name: 'priority', type: 'INTEGER', constraint: 'DEFAULT 0', color: COLORS.number },
              { name: 'max_price', type: 'NUMERIC(12,2)', color: COLORS.number },
              { name: 'notes', type: 'TEXT', color: COLORS.text_type },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
            indexes: ['UNIQUE (user_id, item_id)'],
          },
        ],
      },
      {
        name: 'Authentication',
        color: COLORS.accent,
        desc: 'OAuth2 with Apple & Google sign-in',
        tables: [
          {
            name: 'users',
            desc: 'Registered user accounts',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK DEFAULT gen_random_uuid()', color: COLORS.pk },
              { name: 'email', type: 'VARCHAR(255)', constraint: 'UNIQUE', color: COLORS.text_type },
              { name: 'email_verified', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'display_name', type: 'VARCHAR(255)', color: COLORS.text_type },
              { name: 'avatar_url', type: 'TEXT', color: COLORS.text_type },
              { name: 'deactivated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'deleted_at', type: 'TIMESTAMPTZ', constraint: 'GDPR tombstone', color: COLORS.date },
              { name: 'created_at', type: 'TIMESTAMPTZ', color: COLORS.date },
              { name: 'updated_at', type: 'TIMESTAMPTZ', color: COLORS.date },
            ],
          },
          {
            name: 'oauth_accounts',
            desc: 'Linked OAuth providers (Apple, Google)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'user_id', type: 'UUID', constraint: 'FK → users CASCADE NOT NULL', color: COLORS.fk },
              { name: 'provider', type: 'VARCHAR(50)', constraint: "NOT NULL ('apple'|'google')", color: COLORS.enum },
              { name: 'provider_user_id', type: 'VARCHAR(255)', constraint: 'NOT NULL', color: COLORS.text_type },
              { name: 'email', type: 'VARCHAR(255)', color: COLORS.text_type },
              { name: 'is_private_email', type: 'BOOLEAN', constraint: 'DEFAULT FALSE', color: COLORS.bool },
              { name: 'raw_profile', type: 'JSONB', color: COLORS.json },
              { name: 'created_at', type: 'TIMESTAMP', color: COLORS.date },
            ],
            indexes: ['UNIQUE (provider, provider_user_id)'],
          },
          {
            name: 'refresh_tokens',
            desc: 'Session refresh tokens (30-day, revocable)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'user_id', type: 'UUID', constraint: 'FK → users CASCADE NOT NULL', color: COLORS.fk },
              { name: 'token_hash', type: 'VARCHAR(255)', constraint: 'UNIQUE NOT NULL', color: COLORS.text_type },
              { name: 'device_info', type: 'VARCHAR(255)', color: COLORS.text_type },
              { name: 'expires_at', type: 'TIMESTAMP', constraint: 'NOT NULL', color: COLORS.date },
              { name: 'revoked_at', type: 'TIMESTAMP', color: COLORS.date },
              { name: 'created_at', type: 'TIMESTAMP', color: COLORS.date },
            ],
          },
        ],
      },
    ],
  },
  native: {
    label: 'macOS + iOS Native — SwiftData / CloudKit',
    sublabel: 'Local-first with iCloud sync, single-user architecture',
    groups: [
      {
        name: 'Core Entities',
        color: COLORS.native,
        desc: 'SwiftData @Model classes in shared Swift Package',
        tables: [
          {
            name: 'CollectionItem',
            desc: '@Model — Primary entity for each figure in the collection',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              {
                name: 'name',
                type: 'String',
                constraint: "required — manufacturer's product name",
                color: COLORS.text_type,
              },
              { name: 'franchise', type: 'String', constraint: 'required', color: COLORS.text_type },
              { name: 'toyLine', type: '@Relationship', constraint: '→ ToyLine? (nullify)', color: COLORS.fk },
              {
                name: 'manufacturer',
                type: '@Relationship',
                constraint: '→ Manufacturer? (nullify)',
                color: COLORS.fk,
              },
              { name: 'isThirdParty', type: 'Bool', color: COLORS.bool },
              { name: 'characterName', type: 'String', constraint: 'required', color: COLORS.text_type },
              { name: 'thirdPartyHomage', type: 'String?', color: COLORS.text_type },
              { name: 'yearReleased', type: 'Int?', color: COLORS.number },
              { name: 'upcBarcode', type: 'String?', color: COLORS.text_type },
              { name: 'sku', type: 'String?', color: COLORS.text_type },
              {
                name: 'productCode',
                type: 'String?',
                constraint: 'user-definable item ID (e.g. MP-44)',
                color: COLORS.text_type,
              },
              { name: 'condition', type: 'ItemCondition', constraint: 'enum (raw String)', color: COLORS.enum },
              { name: 'completenessNotes', type: 'String?', color: COLORS.text_type },
              { name: 'acquisitionDate', type: 'Date?', color: COLORS.date },
              { name: 'acquisitionPrice', type: 'Decimal?', color: COLORS.number },
              { name: 'acquisitionSource', type: 'String?', color: COLORS.text_type },
              { name: 'notes', type: 'String?', color: COLORS.text_type },
              { name: 'metadata', type: 'ItemMetadata', constraint: 'Codable Transformable', color: COLORS.json },
              { name: 'photos', type: '@Relationship', constraint: '→ [ItemPhoto] (cascade)', color: COLORS.fk },
              {
                name: 'priceRecords',
                type: '@Relationship',
                constraint: '→ [PriceRecord] (cascade)',
                color: COLORS.fk,
              },
              { name: 'tags', type: '@Relationship', constraint: '→ [Tag]', color: COLORS.fk },
              { name: 'createdAt', type: 'Date', color: COLORS.date },
              { name: 'updatedAt', type: 'Date', color: COLORS.date },
            ],
          },
          {
            name: 'Manufacturer',
            desc: '@Model — Hasbro, FansToys, Takara Tomy, etc.',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'name', type: 'String', constraint: 'required', color: COLORS.text_type },
              { name: 'isOfficialLicensee', type: 'Bool', color: COLORS.bool },
              { name: 'country', type: 'String?', color: COLORS.text_type },
              { name: 'websiteURL', type: 'String?', color: COLORS.text_type },
              { name: 'aliases', type: '[String]', constraint: 'Transformable', color: COLORS.json },
              { name: 'notes', type: 'String?', color: COLORS.text_type },
              { name: 'items', type: '@Relationship', constraint: '→ [CollectionItem] (inverse)', color: COLORS.fk },
            ],
          },
          {
            name: 'ToyLine',
            desc: '@Model — Masterpiece, Classified Series, etc.',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'name', type: 'String', constraint: 'required', color: COLORS.text_type },
              { name: 'franchise', type: 'String', color: COLORS.text_type },
              {
                name: 'manufacturer',
                type: '@Relationship',
                constraint: '→ Manufacturer? (nullify)',
                color: COLORS.fk,
              },

              { name: 'scale', type: 'String?', color: COLORS.text_type },
              { name: 'description_', type: 'String?', color: COLORS.text_type },
              { name: 'items', type: '@Relationship', constraint: '→ [CollectionItem] (inverse)', color: COLORS.fk },
            ],
          },
          {
            name: 'ItemPhoto',
            desc: '@Model — Photos stored as CloudKit CKAsset',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'item', type: '@Relationship', constraint: '→ CollectionItem (inverse)', color: COLORS.fk },
              { name: 'filePath', type: 'String', color: COLORS.text_type },
              { name: 'thumbnailPath', type: 'String?', color: COLORS.text_type },
              { name: 'photoType', type: 'PhotoType', constraint: 'enum (raw String)', color: COLORS.enum },
              { name: 'isPrimary', type: 'Bool', constraint: 'DEFAULT false', color: COLORS.bool },
              { name: 'displayOrder', type: 'Int', constraint: 'sort order (no ordered rels)', color: COLORS.number },
              { name: 'captureDate', type: 'Date?', color: COLORS.date },
              { name: 'mlClassification', type: 'MLResult?', constraint: 'Codable JSON', color: COLORS.json },
            ],
          },
          {
            name: 'PriceRecord',
            desc: '@Model — Time-series pricing observations',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'item', type: '@Relationship', constraint: '→ CollectionItem (inverse)', color: COLORS.fk },
              { name: 'priceType', type: 'PriceType', constraint: 'enum (raw String)', color: COLORS.enum },
              { name: 'amount', type: 'Decimal', constraint: 'required', color: COLORS.number },
              { name: 'currency', type: 'String', constraint: 'ISO 4217', color: COLORS.text_type },
              { name: 'sourcePlatform', type: 'String?', color: COLORS.text_type },
              { name: 'sourceURL', type: 'String?', color: COLORS.text_type },
              { name: 'listingDate', type: 'Date?', color: COLORS.date },
              { name: 'isSold', type: 'Bool', color: COLORS.bool },
              { name: 'notes', type: 'String?', color: COLORS.text_type },
            ],
          },
          {
            name: 'Tag',
            desc: '@Model — Hierarchical tags (location, status, custom)',
            fields: [
              { name: 'id', type: 'UUID', constraint: 'PK', color: COLORS.pk },
              { name: 'name', type: 'String', constraint: 'required', color: COLORS.text_type },
              { name: 'parentTag', type: '@Relationship', constraint: '→ Tag? (self-ref, nullify)', color: COLORS.fk },
              { name: 'childTags', type: '@Relationship', constraint: '→ [Tag] (inverse)', color: COLORS.fk },
              { name: 'items', type: '@Relationship', constraint: '→ [CollectionItem] (inverse)', color: COLORS.fk },
            ],
          },
        ],
      },
      {
        name: 'Enumerations',
        color: COLORS.enum,
        desc: 'Swift enums stored as raw String values for CloudKit compatibility',
        tables: [
          {
            name: 'ItemCondition',
            desc: 'enum: String, Codable',
            fields: [
              { name: 'misb', type: '"MISB"', constraint: 'Mint In Sealed Box', color: COLORS.enum },
              { name: 'mib', type: '"MIB"', constraint: 'Mint In Box', color: COLORS.enum },
              { name: 'looseComplete', type: '"Loose Complete"', color: COLORS.enum },
              { name: 'looseIncomplete', type: '"Loose Incomplete"', color: COLORS.enum },
              { name: 'damaged', type: '"Damaged"', color: COLORS.enum },
            ],
          },
          {
            name: 'PhotoType',
            desc: 'enum: String, Codable',
            fields: [
              { name: 'front', type: '"Front"', color: COLORS.enum },
              { name: 'back', type: '"Back"', color: COLORS.enum },
              { name: 'side', type: '"Side"', color: COLORS.enum },
              { name: 'boxArt', type: '"BoxArt"', color: COLORS.enum },
              { name: 'accessory', type: '"Accessory"', color: COLORS.enum },
              { name: 'damage', type: '"Damage"', color: COLORS.enum },
              { name: 'other', type: '"Other"', color: COLORS.enum },
            ],
          },
          {
            name: 'PriceType',
            desc: 'enum: String, Codable',
            fields: [
              { name: 'msrp', type: '"MSRP"', color: COLORS.enum },
              { name: 'resaleListing', type: '"Resale_Listing"', color: COLORS.enum },
              { name: 'resaleSold', type: '"Resale_Sold"', color: COLORS.enum },
              { name: 'appraisal', type: '"Appraisal"', color: COLORS.enum },
              { name: 'insuranceValue', type: '"Insurance_Value"', color: COLORS.enum },
            ],
          },
        ],
      },
    ],
  },
};

const relationships = {
  web: [
    // Shared catalog
    { from: 'sub_groups', to: 'factions', label: 'faction_id (SET NULL)', type: 'many-to-one' },
    { from: 'characters', to: 'factions', label: 'faction_id (SET NULL)', type: 'many-to-one' },
    { from: 'character_sub_groups', to: 'characters', label: 'character_id (CASCADE)', type: 'many-to-one' },
    { from: 'character_sub_groups', to: 'sub_groups', label: 'sub_group_id (CASCADE)', type: 'many-to-one' },
    { from: 'characters', to: 'continuity_families', label: 'continuity_family_id (RESTRICT)', type: 'many-to-one' },
    { from: 'characters', to: 'characters', label: 'combined_form_id (self, SET NULL)', type: 'self-ref' },
    { from: 'character_appearances', to: 'characters', label: 'character_id (CASCADE)', type: 'many-to-one' },
    { from: 'items', to: 'character_appearances', label: 'character_appearance_id (SET NULL)', type: 'many-to-one' },
    { from: 'items', to: 'manufacturers', label: 'manufacturer_id', type: 'many-to-one' },
    { from: 'items', to: 'characters', label: 'character_id', type: 'many-to-one' },
    { from: 'items', to: 'toy_lines', label: 'toy_line_id', type: 'many-to-one' },
    { from: 'items', to: 'users', label: 'created_by', type: 'many-to-one' },
    { from: 'item_photos', to: 'items', label: 'item_id (CASCADE)', type: 'many-to-one' },
    { from: 'item_photos', to: 'users', label: 'uploaded_by', type: 'many-to-one' },
    { from: 'toy_lines', to: 'manufacturers', label: 'manufacturer_id', type: 'many-to-one' },
    { from: 'catalog_edits', to: 'items', label: 'item_id', type: 'many-to-one' },
    { from: 'catalog_edits', to: 'users', label: 'editor_id', type: 'many-to-one' },
    // Private collections
    { from: 'user_collection_items', to: 'users', label: 'user_id (CASCADE)', type: 'many-to-one' },
    { from: 'user_collection_items', to: 'items', label: 'item_id (CASCADE)', type: 'many-to-one' },
    {
      from: 'user_pricing_records',
      to: 'user_collection_items',
      label: 'user_collection_item_id (CASCADE)',
      type: 'many-to-one',
    },
    { from: 'user_pricing_records', to: 'users', label: 'user_id (denormalized)', type: 'many-to-one' },
    { from: 'user_wantlist', to: 'users', label: 'user_id (CASCADE)', type: 'many-to-one' },
    { from: 'user_wantlist', to: 'items', label: 'item_id (CASCADE)', type: 'many-to-one' },
    // Auth
    { from: 'oauth_accounts', to: 'users', label: 'user_id (CASCADE)', type: 'many-to-one' },
    { from: 'refresh_tokens', to: 'users', label: 'user_id (CASCADE)', type: 'many-to-one' },
  ],
  native: [
    { from: 'CollectionItem', to: 'ToyLine', label: '@Relationship (nullify)', type: 'many-to-one' },
    { from: 'CollectionItem', to: 'Manufacturer', label: '@Relationship (nullify)', type: 'many-to-one' },
    { from: 'CollectionItem', to: 'ItemPhoto', label: '@Relationship (cascade)', type: 'one-to-many' },
    { from: 'CollectionItem', to: 'PriceRecord', label: '@Relationship (cascade)', type: 'one-to-many' },
    { from: 'CollectionItem', to: 'Tag', label: '@Relationship (many-to-many)', type: 'many-to-many' },
    { from: 'ToyLine', to: 'Manufacturer', label: '@Relationship (nullify)', type: 'many-to-one' },
    { from: 'Tag', to: 'Tag', label: 'parentTag (self-ref)', type: 'self-ref' },
  ],
};

function TableCard({ table, groupColor, isExpanded, onToggle }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
        cursor: 'pointer',
      }}
      onClick={onToggle}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = groupColor)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${groupColor}18, ${groupColor}08)`,
          borderBottom: `1px solid ${groupColor}30`,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
              fontWeight: 700,
              fontSize: 14,
              color: groupColor,
              letterSpacing: '0.02em',
            }}
          >
            {table.name}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{table.desc}</div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: COLORS.textDim,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </div>
      </div>
      {isExpanded && (
        <div style={{ padding: '6px 0' }}>
          {table.fields.map((f, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 14px',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                gap: 8,
                background: i % 2 === 0 ? 'transparent' : `${COLORS.border}30`,
              }}
            >
              <span style={{ color: f.color, minWidth: 140, fontWeight: f.constraint?.includes('PK') ? 700 : 400 }}>
                {f.constraint?.includes('PK') ? '🔑 ' : f.constraint?.includes('FK') ? '🔗 ' : '   '}
                {f.name}
              </span>
              <span style={{ color: COLORS.textDim, minWidth: 120, fontSize: 11 }}>{f.type}</span>
              {f.constraint && (
                <span style={{ color: COLORS.textMuted, fontSize: 10, fontStyle: 'italic' }}>{f.constraint}</span>
              )}
            </div>
          ))}
          {table.indexes && (
            <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: '6px 14px', marginTop: 4 }}>
              {table.indexes.map((idx, i) => (
                <div key={i} style={{ fontSize: 10, color: COLORS.accentLight, fontFamily: 'monospace' }}>
                  📇 INDEX: {idx}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelationshipList({ rels }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginBottom: 10 }}>Relationships</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rels.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'monospace' }}>
            <span style={{ color: COLORS.accentLight, fontWeight: 600, minWidth: 160 }}>{r.from}</span>
            <span
              style={{
                color: r.type === 'self-ref' ? COLORS.enum : r.type === 'many-to-many' ? COLORS.json : COLORS.fk,
              }}
            >
              {r.type === 'one-to-many'
                ? '──┤┤'
                : r.type === 'many-to-many'
                  ? '┤├──┤├'
                  : r.type === 'self-ref'
                    ? '↻'
                    : '──►'}
            </span>
            <span style={{ color: COLORS.accentLight, fontWeight: 600, minWidth: 160 }}>{r.to}</span>
            <span style={{ color: COLORS.textDim, fontStyle: 'italic' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ToyDatabaseDiagrams() {
  const [activeSchema, setActiveSchema] = useState('web');
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [expandAll, setExpandAll] = useState(false);

  const schema = schemas[activeSchema];
  const rels = relationships[activeSchema];

  const allTableNames = schema.groups.flatMap((g) => g.tables.map((t) => t.name));

  const toggleTable = (name) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (expandAll) {
      setExpandedTables(new Set());
    } else {
      setExpandedTables(new Set(allTableNames));
    }
    setExpandAll(!expandAll);
  };

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: '100vh',
        color: COLORS.text,
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${COLORS.border}` }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            color: COLORS.textDim,
            marginBottom: 4,
          }}
        >
          Toy Collection Catalog & Pricing App
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: COLORS.text }}>Database & Entity Diagrams</h1>

        {/* Schema toggle */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {Object.entries(schemas).map(([key, s]) => (
            <button
              key={key}
              onClick={() => {
                setActiveSchema(key);
                setExpandedTables(new Set());
                setExpandAll(false);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: `1px solid ${activeSchema === key ? (key === 'web' ? COLORS.accent : COLORS.native) : COLORS.border}`,
                background:
                  activeSchema === key ? (key === 'web' ? `${COLORS.accent}20` : `${COLORS.native}20`) : 'transparent',
                color: activeSchema === key ? (key === 'web' ? COLORS.accentLight : COLORS.native) : COLORS.textMuted,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {key === 'web' ? '🌐 ' : '🍎 '}
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim }}>{schema.sublabel}</div>
          <button
            onClick={toggleAll}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: `1px solid ${COLORS.border}`,
              background: 'transparent',
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {expandAll ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          padding: '12px 32px',
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 11,
        }}
      >
        {[
          { icon: '🔑', label: 'Primary Key', color: COLORS.pk },
          { icon: '🔗', label: 'Foreign Key', color: COLORS.fk },
          { icon: '●', label: 'Boolean', color: COLORS.bool },
          { icon: '●', label: 'Enum', color: COLORS.enum },
          { icon: '●', label: 'Text/String', color: COLORS.text_type },
          { icon: '●', label: 'Numeric', color: COLORS.number },
          { icon: '●', label: 'Date/Time', color: COLORS.date },
          { icon: '●', label: 'JSON/Codable', color: COLORS.json },
        ].map((l, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, color: l.color }}>
            {l.icon} <span style={{ color: COLORS.textMuted }}>{l.label}</span>
          </span>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {schema.groups.map((group, gi) => (
          <div key={gi}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 4, height: 24, borderRadius: 2, background: group.color }} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: group.color }}>{group.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim }}>{group.desc}</div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.textDim,
                  marginLeft: 'auto',
                  background: `${group.color}15`,
                  padding: '3px 10px',
                  borderRadius: 12,
                  border: `1px solid ${group.color}30`,
                }}
              >
                {group.tables.length} {group.tables.length === 1 ? 'table' : 'tables'}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
                gap: 12,
              }}
            >
              {group.tables.map((table) => (
                <TableCard
                  key={table.name}
                  table={table}
                  groupColor={group.color}
                  isExpanded={expandedTables.has(table.name)}
                  onToggle={() => toggleTable(table.name)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Relationships */}
        <RelationshipList rels={rels} />

        {/* RLS note for web */}
        {activeSchema === 'web' && (
          <div
            style={{
              background: `${COLORS.private}10`,
              border: `1px solid ${COLORS.private}30`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.private, marginBottom: 6 }}>
              Row-Level Security (RLS) Strategy
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              RLS is enabled <strong style={{ color: COLORS.text }}>only on private tables</strong>{' '}
              (user_collection_items, user_pricing_records, user_wantlist). Shared catalog tables remain open to all
              authenticated users. Each API request sets{' '}
              <code style={{ color: COLORS.json, background: `${COLORS.json}15`, padding: '1px 4px', borderRadius: 3 }}>
                SET app.user_id = '...'
              </code>{' '}
              via session config. The policy uses{' '}
              <code style={{ color: COLORS.json, background: `${COLORS.json}15`, padding: '1px 4px', borderRadius: 3 }}>
                (SELECT current_app_user_id())
              </code>{' '}
              subselect wrapper for initPlan caching (avoids per-row evaluation). user_id is denormalized on
              user_pricing_records to avoid chained RLS joins.
            </div>
          </div>
        )}

        {/* CloudKit note for native */}
        {activeSchema === 'native' && (
          <div
            style={{
              background: `${COLORS.native}10`,
              border: `1px solid ${COLORS.native}30`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.native, marginBottom: 6 }}>
              CloudKit Compatibility Constraints
            </div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.text }}>No unique constraints</strong> — app-level checks prevent
              duplicates. <strong style={{ color: COLORS.text }}>No ordered relationships</strong> — use displayOrder
              integer attribute. <strong style={{ color: COLORS.text }}>No deny delete rules</strong> — nullify or
              cascade only. <strong style={{ color: COLORS.text }}>All fields optional at storage layer</strong> —
              SwiftData handles transparently. Enums stored as raw String values. Arrays via Transformable [String].
              JSONB fields as Codable structs. Photos synced as CloudKit CKAsset values with on-demand download on iOS.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
