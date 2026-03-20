/**
 * Seed data validation tests — validates all JSON files in api/db/seed/
 * for referential integrity, slug format, metadata counts, and structural
 * consistency WITHOUT requiring a database connection.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Path setup ──────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_DIR = path.resolve(__dirname, '../../db/seed/sample');
const SEED_DIR = process.env['SEED_DATA_PATH']
  ? path.resolve(process.env['SEED_DATA_PATH'])
  : DEFAULT_SEED_DIR;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReferenceRecord {
  slug: string;
  [key: string]: unknown;
}

interface SubGroupRecord extends ReferenceRecord {
  faction_slug: string | null;
}

interface ToyLineRecord extends ReferenceRecord {
  manufacturer_slug: string;
}

interface ReferenceFile<T extends ReferenceRecord = ReferenceRecord> {
  _metadata: { total: number; [key: string]: unknown };
  data: T[];
}

interface CharacterRecord {
  name: string;
  slug: string;
  franchise_slug: string;
  continuity_family_slug: string;
  character_type: string;
  is_combined_form: boolean;
  faction_slug: string | null;
  sub_group_slugs: string[];
  [key: string]: unknown;
}

interface CharacterFile {
  _metadata: { total_characters: number; [key: string]: unknown };
  characters: CharacterRecord[];
}

interface ItemRecord {
  name: string;
  slug: string;
  product_code: string;
  character_slug: string;
  character_appearance_slug: string | null;
  manufacturer_slug: string;
  toy_line_slug: string;
  is_third_party: boolean;
  year_released: number | null;
  size_class: string | null;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

interface ItemFile {
  _metadata: { total_items: number; [key: string]: unknown };
  items: ItemRecord[];
}

interface AppearanceRecord {
  slug: string;
  name: string;
  character_slug: string;
  description: string | null;
  source_media: string | null;
  source_name: string | null;
  year_start: number | null;
  year_end: number | null;
  metadata: Record<string, unknown>;
  [key: string]: unknown;
}

interface AppearanceFile {
  _metadata: { total: number; [key: string]: unknown };
  data: AppearanceRecord[];
}

interface RelationshipEntity {
  slug: string;
  role: string | null;
}

interface RelationshipRecord {
  type: string;
  subtype: string | null;
  entity1: RelationshipEntity;
  entity2: RelationshipEntity;
  metadata: Record<string, unknown>;
}

interface RelationshipFile {
  _metadata: { total: number; [key: string]: unknown };
  relationships: RelationshipRecord[];
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

function loadSeedFile<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, relPath), 'utf-8')) as T;
}

function loadRef<T extends ReferenceRecord>(relPath: string): ReferenceFile<T> {
  return loadSeedFile<ReferenceFile<T>>(relPath);
}

// ─── Auto-discovery helper ───────────────────────────────────────────────────

function discoverJsonFiles(subdir: string, options?: { recursive: boolean }): string[] {
  const dir = path.join(SEED_DIR, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: options?.recursive ?? false })
    .filter((f): f is string => typeof f === 'string' && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(subdir, f));
}

function discoverAndLoad<T>(subdir: string, options?: { recursive: boolean }): Array<{ file: string } & T> {
  return discoverJsonFiles(subdir, options).map((f) => ({
    file: f,
    ...loadSeedFile<T>(f),
  }));
}

// ─── Load all seed data at module scope ──────────────────────────────────────

const franchises = loadRef('reference/franchises.json');
const continuityFamilies = loadRef('reference/continuity_families.json');
const factions = loadRef('reference/factions.json');
const subGroups = loadRef<SubGroupRecord>('reference/sub_groups.json');
const manufacturers = loadRef('reference/manufacturers.json');
const toyLines = loadRef<ToyLineRecord>('reference/toy_lines.json');

const charFiles = discoverAndLoad<CharacterFile>('characters');
const itemFiles = discoverAndLoad<ItemFile>('items', { recursive: true });
const appearanceFiles = discoverAndLoad<AppearanceFile>('appearances');
const relationshipFiles = discoverAndLoad<RelationshipFile>('relationships');

// ─── Derived lookup sets ─────────────────────────────────────────────────────

const franchiseSlugs = new Set(franchises.data.map((r) => r.slug));
const continuityFamilySlugs = new Set(continuityFamilies.data.map((r) => r.slug));
const factionSlugs = new Set(factions.data.map((r) => r.slug));
const subGroupSlugs = new Set(subGroups.data.map((r) => r.slug));
const manufacturerSlugs = new Set(manufacturers.data.map((r) => r.slug));
const toyLineSlugs = new Set(toyLines.data.map((r) => r.slug));
const allCharacters = charFiles.flatMap(({ characters }) => characters);
const allCharacterSlugs = new Set(allCharacters.map((c) => c.slug));
const allAppearanceSlugs = new Set(appearanceFiles.flatMap(({ data }) => data.map((a) => a.slug)));
const allRelationships = relationshipFiles.flatMap(({ relationships }) => relationships);
const charBySlugGlobal = new Map(allCharacters.map((c) => [c.slug, c]));

// ─── Constants ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Relationship type registry ─────────────────────────────────────────────

const COMBINER_BODY_ROLES = new Set([
  'torso',
  'right arm',
  'left arm',
  'right leg',
  'left leg',
  'upper torso',
  'lower torso',
  'upper body',
  'lower body',
  'torso (right half)',
  'torso (left half)',
  'main body',
  'wings/booster',
  'weapon',
  'back-mounted weapon',
  'back',
]);

interface RelationshipTypeSpec {
  entity1Roles: Set<string>;
  entity2Roles: Set<string> | null; // null = any string or null allowed
  requiredSubtypes: Set<string> | null; // null = no subtypes (must be null)
  optionalSubtypes: Set<string> | null; // null = no optional subtypes
  symmetric: boolean;
}

const RELATIONSHIP_TYPE_REGISTRY = new Map<string, RelationshipTypeSpec>([
  [
    'combiner-component',
    {
      entity1Roles: new Set(['gestalt']),
      entity2Roles: COMBINER_BODY_ROLES, // null roles also allowed (checked separately)
      requiredSubtypes: null,
      optionalSubtypes: null,
      symmetric: false,
    },
  ],
  [
    'binary-bond',
    {
      entity1Roles: new Set(['host']),
      entity2Roles: new Set([
        'head-partner',
        'weapon-partner',
        'engine-partner',
        'face-partner',
        'transtector-partner',
      ]),
      requiredSubtypes: new Set([
        'headmaster',
        'targetmaster',
        'powermaster',
        'brainmaster',
        'godmaster',
      ]),
      optionalSubtypes: null,
      symmetric: false,
    },
  ],
  [
    'vehicle-crew',
    {
      entity1Roles: new Set(['vehicle']),
      entity2Roles: new Set(['driver', 'pilot', 'gunner', 'commander', 'crew']),
      requiredSubtypes: null,
      optionalSubtypes: new Set(['packaged-with', 'media-assigned']),
      symmetric: false,
    },
  ],
  [
    'rival',
    {
      entity1Roles: new Set(['rival']),
      entity2Roles: new Set(['rival']),
      requiredSubtypes: null,
      optionalSubtypes: null,
      symmetric: true,
    },
  ],
  [
    'sibling',
    {
      entity1Roles: new Set(['sibling', 'twin']),
      entity2Roles: new Set(['sibling', 'twin']),
      requiredSubtypes: null,
      optionalSubtypes: new Set(['twin', 'clone']),
      symmetric: true,
    },
  ],
  [
    'mentor-student',
    {
      entity1Roles: new Set(['mentor']),
      entity2Roles: new Set(['student']),
      requiredSubtypes: null,
      optionalSubtypes: null,
      symmetric: false,
    },
  ],
  [
    'evolution',
    {
      entity1Roles: new Set(['base-form']),
      entity2Roles: new Set(['evolved-form']),
      requiredSubtypes: null,
      optionalSubtypes: new Set(['upgrade', 'reformatting', 'reconstruction']),
      symmetric: false,
    },
  ],
]);

const VALID_RELATIONSHIP_TYPES = new Set(RELATIONSHIP_TYPE_REGISTRY.keys());

const REQUIRED_CHAR_FIELDS = [
  'name',
  'slug',
  'franchise_slug',
  'continuity_family_slug',
  'character_type',
  'is_combined_form',
] as const;

const VALID_SOURCE_MEDIA = new Set(['TV', 'Comic/Manga', 'Movie', 'OVA', 'Toy-only', 'Video Game']);

const REQUIRED_APPEARANCE_FIELDS = ['slug', 'name', 'character_slug', 'source_media', 'source_name'] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('seed data validation', () => {
  // ── 1. Metadata counts ─────────────────────────────────────────────────

  describe('metadata counts', () => {
    it.each([
      { label: 'franchises', total: franchises._metadata.total, actual: franchises.data.length },
      {
        label: 'continuity_families',
        total: continuityFamilies._metadata.total,
        actual: continuityFamilies.data.length,
      },
      { label: 'factions', total: factions._metadata.total, actual: factions.data.length },
      { label: 'sub_groups', total: subGroups._metadata.total, actual: subGroups.data.length },
      { label: 'manufacturers', total: manufacturers._metadata.total, actual: manufacturers.data.length },
      { label: 'toy_lines', total: toyLines._metadata.total, actual: toyLines.data.length },
    ])('$label: _metadata.total matches data array length', ({ label, total, actual }) => {
      expect(actual, `${label}: _metadata.total is ${total} but data has ${actual} entries`).toBe(total);
    });

    it.each(charFiles)(
      '$file: _metadata.total_characters matches characters array length',
      ({ file, _metadata, characters }) => {
        expect(
          characters.length,
          `${file}: _metadata.total_characters is ${_metadata.total_characters} but has ${characters.length} entries`
        ).toBe(_metadata.total_characters);
      }
    );
  });

  // ── 2. Slug format ─────────────────────────────────────────────────────

  describe('slug format', () => {
    it.each([
      { label: 'franchises', records: franchises.data },
      { label: 'continuity_families', records: continuityFamilies.data },
      { label: 'factions', records: factions.data },
      { label: 'sub_groups', records: subGroups.data },
      { label: 'manufacturers', records: manufacturers.data },
      { label: 'toy_lines', records: toyLines.data },
    ])('all $label slugs match kebab-case format', ({ label, records }) => {
      for (const r of records) {
        expect(SLUG_RE.test(r.slug), `${label}: invalid slug "${r.slug}"`).toBe(true);
      }
    });

    it.each(charFiles)('$file: all character slugs match kebab-case format', ({ file, characters }) => {
      for (const c of characters) {
        expect(SLUG_RE.test(c.slug), `${file} > "${c.name}": invalid slug "${c.slug}"`).toBe(true);
      }
    });
  });

  // ── 3. No duplicate slugs ──────────────────────────────────────────────

  describe('no duplicate slugs', () => {
    it.each([
      { label: 'franchises', records: franchises.data },
      { label: 'continuity_families', records: continuityFamilies.data },
      { label: 'factions', records: factions.data },
      { label: 'sub_groups', records: subGroups.data },
      { label: 'manufacturers', records: manufacturers.data },
      { label: 'toy_lines', records: toyLines.data },
    ])('$label has no duplicate slugs', ({ label, records }) => {
      const seen = new Set<string>();
      for (const r of records) {
        expect(seen.has(r.slug), `${label}: duplicate slug "${r.slug}"`).toBe(false);
        seen.add(r.slug);
      }
    });

    it.each(charFiles)('$file: no duplicate slugs within file', ({ file, characters }) => {
      const seen = new Set<string>();
      for (const c of characters) {
        expect(seen.has(c.slug), `${file}: duplicate slug "${c.slug}" (name: "${c.name}")`).toBe(false);
        seen.add(c.slug);
      }
    });

    it('no duplicate character slugs across all character files', () => {
      const seen = new Map<string, string>();
      for (const { file, characters } of charFiles) {
        for (const c of characters) {
          const existing = seen.get(c.slug);
          expect(existing, `Slug "${c.slug}" appears in both "${existing}" and "${file}"`).toBeUndefined();
          seen.set(c.slug, file);
        }
      }
    });
  });

  // ── 4. FK referential integrity ────────────────────────────────────────

  describe('FK referential integrity', () => {
    it('factions: franchise_slug resolves to franchises', () => {
      for (const f of factions.data) {
        const franchiseSlug = (f as Record<string, unknown>)['franchise_slug'] as string;
        expect(
          franchiseSlugs.has(franchiseSlug),
          `factions > "${f.slug}": unknown franchise_slug "${franchiseSlug}"`
        ).toBe(true);
      }
    });

    it('sub_groups: franchise_slug resolves to franchises', () => {
      for (const sg of subGroups.data) {
        const franchiseSlug = (sg as Record<string, unknown>)['franchise_slug'] as string;
        expect(
          franchiseSlugs.has(franchiseSlug),
          `sub_groups > "${sg.slug}": unknown franchise_slug "${franchiseSlug}"`
        ).toBe(true);
      }
    });

    it('continuity_families: franchise_slug resolves to franchises', () => {
      for (const cf of continuityFamilies.data) {
        const franchiseSlug = (cf as Record<string, unknown>)['franchise_slug'] as string;
        expect(
          franchiseSlugs.has(franchiseSlug),
          `continuity_families > "${cf.slug}": unknown franchise_slug "${franchiseSlug}"`
        ).toBe(true);
      }
    });

    it('toy_lines: franchise_slug resolves to franchises', () => {
      for (const tl of toyLines.data) {
        const franchiseSlug = (tl as Record<string, unknown>)['franchise_slug'] as string;
        expect(
          franchiseSlugs.has(franchiseSlug),
          `toy_lines > "${tl.slug}": unknown franchise_slug "${franchiseSlug}"`
        ).toBe(true);
      }
    });

    it('sub_groups: faction_slug resolves to factions', () => {
      for (const sg of subGroups.data) {
        if (sg.faction_slug === null) continue;
        expect(
          factionSlugs.has(sg.faction_slug),
          `sub_groups > "${sg.slug}": unknown faction_slug "${sg.faction_slug}"`
        ).toBe(true);
      }
    });

    it('toy_lines: manufacturer_slug resolves to manufacturers', () => {
      for (const tl of toyLines.data) {
        expect(
          manufacturerSlugs.has(tl.manufacturer_slug),
          `toy_lines > "${tl.slug}": unknown manufacturer_slug "${tl.manufacturer_slug}"`
        ).toBe(true);
      }
    });

    it.each(charFiles)('$file: faction_slug resolves to factions', ({ file, characters }) => {
      for (const c of characters) {
        if (c.faction_slug === null) continue;
        expect(
          factionSlugs.has(c.faction_slug),
          `${file} > "${c.name}" (${c.slug}): unknown faction_slug "${c.faction_slug}"`
        ).toBe(true);
      }
    });

    it.each(charFiles)('$file: sub_group_slugs resolve to sub_groups', ({ file, characters }) => {
      for (const c of characters) {
        for (const sgSlug of c.sub_group_slugs) {
          expect(
            subGroupSlugs.has(sgSlug),
            `${file} > "${c.name}" (${c.slug}): unknown sub_group_slug "${sgSlug}"`
          ).toBe(true);
        }
      }
    });

    it.each(charFiles)('$file: continuity_family_slug resolves to continuity_families', ({ file, characters }) => {
      for (const c of characters) {
        expect(
          continuityFamilySlugs.has(c.continuity_family_slug),
          `${file} > "${c.name}" (${c.slug}): unknown continuity_family_slug "${c.continuity_family_slug}"`
        ).toBe(true);
      }
    });

    it.each(charFiles)('$file: franchise_slug resolves to franchises', ({ file, characters }) => {
      for (const c of characters) {
        expect(
          franchiseSlugs.has(c.franchise_slug),
          `${file} > "${c.name}" (${c.slug}): unknown franchise_slug "${c.franchise_slug}"`
        ).toBe(true);
      }
    });
  });

  // ── 5. Combiner/vehicle consistency (now validated via relationship files) ──
  // Old inline combiner/vehicle tests removed — replaced by section 10 (relationship validation)

  // ── 6. Required character fields ───────────────────────────────────────

  describe('required character fields', () => {
    it.each(charFiles)('$file: all characters have required fields', ({ file, characters }) => {
      for (const c of characters) {
        for (const field of REQUIRED_CHAR_FIELDS) {
          expect(field in c, `${file} > "${c.slug}": missing required field "${field}"`).toBe(true);
        }
        expect(Array.isArray(c.sub_group_slugs), `${file} > "${c.slug}": sub_group_slugs must be an array`).toBe(true);
      }
    });
  });

  // ── 7. Name + franchise + continuity_family_slug uniqueness ─────────────

  describe('name + franchise_slug + continuity_family_slug uniqueness', () => {
    it('no two characters share the same (name, franchise_slug, continuity_family_slug)', () => {
      const seen = new Map<string, string>();
      for (const { file, characters } of charFiles) {
        for (const c of characters) {
          const key = `${c.name.toLowerCase()}|||${c.franchise_slug}|||${c.continuity_family_slug}`;
          const existing = seen.get(key);
          expect(
            existing,
            `Duplicate: "${c.name}" / "${c.franchise_slug}" / "${c.continuity_family_slug}" in "${file}" — already in "${existing}"`
          ).toBeUndefined();
          seen.set(key, `${file} > ${c.slug}`);
        }
      }
    });
  });

  // ── 8. Item seed files ─────────────────────────────────────────────────

  describe('item seed files', () => {
    it.each(itemFiles)('$file: _metadata.total_items matches items array length', ({ file, _metadata, items }) => {
      expect(
        items.length,
        `${file}: _metadata.total_items is ${_metadata.total_items} but has ${items.length} entries`
      ).toBe(_metadata.total_items);
    });

    it.each(itemFiles)('$file: all item slugs match kebab-case format', ({ file, items }) => {
      for (const item of items) {
        expect(SLUG_RE.test(item.slug), `${file} > "${item.name}": invalid slug "${item.slug}"`).toBe(true);
      }
    });

    it.each(itemFiles)('$file: no duplicate item slugs', ({ file, items }) => {
      const seen = new Set<string>();
      for (const item of items) {
        expect(seen.has(item.slug), `${file}: duplicate slug "${item.slug}"`).toBe(false);
        seen.add(item.slug);
      }
    });

    it.each(itemFiles)('$file: manufacturer_slug resolves to manufacturers', ({ file, items }) => {
      for (const item of items) {
        expect(
          manufacturerSlugs.has(item.manufacturer_slug),
          `${file} > "${item.name}" (${item.slug}): unknown manufacturer_slug "${item.manufacturer_slug}"`
        ).toBe(true);
      }
    });

    it.each(itemFiles)('$file: toy_line_slug resolves to toy_lines', ({ file, items }) => {
      for (const item of items) {
        expect(
          toyLineSlugs.has(item.toy_line_slug),
          `${file} > "${item.name}" (${item.slug}): unknown toy_line_slug "${item.toy_line_slug}"`
        ).toBe(true);
      }
    });

    it.each(itemFiles)('$file: character_slug resolves to characters', ({ file, items }) => {
      for (const item of items) {
        expect(
          allCharacterSlugs.has(item.character_slug),
          `${file} > "${item.name}" (${item.slug}): unknown character_slug "${item.character_slug}"`
        ).toBe(true);
      }
    });

    it.each(itemFiles)('$file: character_appearance_slug resolves to appearances', ({ file, items }) => {
      for (const item of items) {
        if (item.character_appearance_slug === null) continue;
        expect(
          allAppearanceSlugs.has(item.character_appearance_slug),
          `${file} > "${item.name}" (${item.slug}): unknown character_appearance_slug "${item.character_appearance_slug}"`
        ).toBe(true);
      }
    });

    it.each(itemFiles)('$file: required item fields present', ({ file, items }) => {
      for (const item of items) {
        for (const field of [
          'name',
          'slug',
          'product_code',
          'character_slug',
          'manufacturer_slug',
          'toy_line_slug',
          'is_third_party',
        ] as const) {
          expect(field in item, `${file} > "${item.slug}": missing required field "${field}"`).toBe(true);
        }
        expect(
          typeof item.metadata === 'object' && item.metadata !== null,
          `${file} > "${item.slug}": metadata must be an object`
        ).toBe(true);
      }
    });

    it.each(itemFiles)('$file: no integer ID fields (must use slugs)', ({ file, items }) => {
      for (const item of items) {
        for (const field of [
          'manufacturer_id',
          'toy_line_id',
          'character_id',
          'character_faction_id',
          'character_sub_group_id',
        ] as const) {
          expect(
            field in item,
            `${file} > "${item.slug}": has legacy integer field "${field}" — use slug-based references`
          ).toBe(false);
        }
      }
    });
  });

  // ── 9. Character appearance seed files ────────────────────────────────

  describe('character appearance seed files', () => {
    it.each(appearanceFiles)('$file: _metadata.total matches data array length', ({ file, _metadata, data }) => {
      expect(data.length, `${file}: _metadata.total is ${_metadata.total} but data has ${data.length} entries`).toBe(
        _metadata.total
      );
    });

    it.each(appearanceFiles)('$file: all appearance slugs match kebab-case format', ({ file, data }) => {
      for (const a of data) {
        expect(SLUG_RE.test(a.slug), `${file} > "${a.name}": invalid slug "${a.slug}"`).toBe(true);
      }
    });

    it.each(appearanceFiles)('$file: no duplicate appearance slugs within file', ({ file, data }) => {
      const seen = new Set<string>();
      for (const a of data) {
        expect(seen.has(a.slug), `${file}: duplicate slug "${a.slug}"`).toBe(false);
        seen.add(a.slug);
      }
    });

    it('no duplicate appearance slugs across all appearance files', () => {
      const seen = new Map<string, string>();
      for (const { file, data } of appearanceFiles) {
        for (const a of data) {
          const existing = seen.get(a.slug);
          expect(existing, `Slug "${a.slug}" appears in both "${existing}" and "${file}"`).toBeUndefined();
          seen.set(a.slug, file);
        }
      }
    });

    it.each(appearanceFiles)('$file: character_slug resolves to characters', ({ file, data }) => {
      for (const a of data) {
        expect(
          allCharacterSlugs.has(a.character_slug),
          `${file} > "${a.name}" (${a.slug}): unknown character_slug "${a.character_slug}"`
        ).toBe(true);
      }
    });

    it.each(appearanceFiles)('$file: source_media is a valid value', ({ file, data }) => {
      for (const a of data) {
        if (a.source_media === null) continue;
        expect(
          VALID_SOURCE_MEDIA.has(a.source_media),
          `${file} > "${a.name}" (${a.slug}): unknown source_media "${a.source_media}"`
        ).toBe(true);
      }
    });

    it.each(appearanceFiles)('$file: required appearance fields present', ({ file, data }) => {
      for (const a of data) {
        for (const field of REQUIRED_APPEARANCE_FIELDS) {
          expect(field in a, `${file} > "${a.slug}": missing required field "${field}"`).toBe(true);
        }
      }
    });
  });

  // ── 10. Character relationship seed files ──────────────────────────────────

  describe('character relationship seed files', () => {
    // Relationship files are auto-discovered; tests naturally produce 0 iterations when empty
    it.each(relationshipFiles)(
      '$file: _metadata.total matches relationships array length',
      ({ file, _metadata, relationships }) => {
        expect(
          relationships.length,
          `${file}: _metadata.total is ${_metadata.total} but has ${relationships.length} entries`
        ).toBe(_metadata.total);
      }
    );

    it.each(relationshipFiles)('$file: required relationship fields present', ({ file, relationships }) => {
      for (const r of relationships) {
        expect('type' in r, `${file}: missing required field "type"`).toBe(true);
        expect('entity1' in r, `${file}: missing required field "entity1"`).toBe(true);
        expect('entity2' in r, `${file}: missing required field "entity2"`).toBe(true);
        expect(
          typeof r.metadata === 'object' && r.metadata !== null,
          `${file}: metadata must be an object`
        ).toBe(true);
        expect('slug' in r.entity1, `${file}: entity1 missing "slug"`).toBe(true);
        expect('role' in r.entity1, `${file}: entity1 missing "role"`).toBe(true);
        expect('slug' in r.entity2, `${file}: entity2 missing "slug"`).toBe(true);
        expect('role' in r.entity2, `${file}: entity2 missing "role"`).toBe(true);
      }
    });

    it.each(relationshipFiles)('$file: relationship type is valid', ({ file, relationships }) => {
      for (const r of relationships) {
        expect(
          VALID_RELATIONSHIP_TYPES.has(r.type),
          `${file}: unknown relationship type "${r.type}"`
        ).toBe(true);
      }
    });

    it.each(relationshipFiles)('$file: entity slugs resolve to characters', ({ file, relationships }) => {
      for (const r of relationships) {
        expect(
          allCharacterSlugs.has(r.entity1.slug),
          `${file}: entity1.slug "${r.entity1.slug}" does not exist in character data`
        ).toBe(true);
        expect(
          allCharacterSlugs.has(r.entity2.slug),
          `${file}: entity2.slug "${r.entity2.slug}" does not exist in character data`
        ).toBe(true);
      }
    });

    it.each(relationshipFiles)('$file: no self-referential relationships', ({ file, relationships }) => {
      for (const r of relationships) {
        expect(
          r.entity1.slug,
          `${file}: self-referential relationship: "${r.entity1.slug}" (type: ${r.type})`
        ).not.toBe(r.entity2.slug);
      }
    });

    it.each(relationshipFiles)(
      '$file: entity1.role and entity2.role valid for relationship type',
      ({ file, relationships }) => {
        for (const r of relationships) {
          const spec = RELATIONSHIP_TYPE_REGISTRY.get(r.type);
          if (!spec) continue; // caught by type validation test

          expect(
            spec.entity1Roles.has(r.entity1.role ?? ''),
            `${file}: entity1.role "${r.entity1.role}" invalid for type "${r.type}". Expected one of: ${[...spec.entity1Roles].join(', ')}`
          ).toBe(true);

          // entity2.role: null is allowed (e.g. combiner-component undocumented roles);
          // when non-null and spec defines an allowlist, validate against it
          if (r.entity2.role !== null && spec.entity2Roles !== null) {
            expect(
              spec.entity2Roles.has(r.entity2.role),
              `${file}: entity2.role "${r.entity2.role}" invalid for type "${r.type}". Expected one of: ${[...spec.entity2Roles].join(', ')}`
            ).toBe(true);
          }
        }
      }
    );

    it.each(relationshipFiles)(
      '$file: subtype valid for relationship type',
      ({ file, relationships }) => {
        for (const r of relationships) {
          const spec = RELATIONSHIP_TYPE_REGISTRY.get(r.type);
          if (!spec) continue;

          if (spec.requiredSubtypes) {
            // Subtype is required
            expect(
              r.subtype !== null && spec.requiredSubtypes.has(r.subtype),
              `${file}: type "${r.type}" requires subtype from: ${[...spec.requiredSubtypes].join(', ')}. Got: "${r.subtype}"`
            ).toBe(true);
          } else if (spec.optionalSubtypes) {
            // Subtype is optional but must be valid if present
            if (r.subtype !== null) {
              expect(
                spec.optionalSubtypes.has(r.subtype),
                `${file}: type "${r.type}" subtype "${r.subtype}" invalid. Expected one of: ${[...spec.optionalSubtypes].join(', ')}`
              ).toBe(true);
            }
          } else {
            // No subtypes allowed
            expect(
              r.subtype === null || r.subtype === undefined,
              `${file}: type "${r.type}" does not support subtypes, but got "${r.subtype}"`
            ).toBe(true);
          }
        }
      }
    );

    it.each(relationshipFiles)(
      '$file: symmetric types have alphabetically ordered entity slugs',
      ({ file, relationships }) => {
        for (const r of relationships) {
          const spec = RELATIONSHIP_TYPE_REGISTRY.get(r.type);
          if (!spec?.symmetric) continue;
          expect(
            r.entity1.slug < r.entity2.slug,
            `${file}: symmetric type "${r.type}" requires entity1.slug < entity2.slug alphabetically. Got "${r.entity1.slug}" and "${r.entity2.slug}"`
          ).toBe(true);
        }
      }
    );

    it('no duplicate (type, entity1.slug, entity2.slug) tuples across all files', () => {
      const seen = new Map<string, string>();
      for (const { file, relationships } of relationshipFiles) {
        for (const r of relationships) {
          const key = `${r.type}|${r.entity1.slug}|${r.entity2.slug}`;
          const existing = seen.get(key);
          expect(
            existing,
            `Duplicate relationship: ${key} in "${file}" — already in "${existing}"`
          ).toBeUndefined();
          seen.set(key, file);
        }
      }
    });

    it('combiner-component: each component (entity2) in at most one combiner', () => {
      const componentToGestalt = new Map<string, string>();
      for (const r of allRelationships) {
        if (r.type !== 'combiner-component') continue;
        const existing = componentToGestalt.get(r.entity2.slug);
        expect(
          existing,
          `Component "${r.entity2.slug}" is in combiner "${r.entity1.slug}" but already assigned to "${existing}"`
        ).toBeUndefined();
        componentToGestalt.set(r.entity2.slug, r.entity1.slug);
      }
    });

    it('combiner-component: entity1 must have is_combined_form=true', () => {
      for (const r of allRelationships) {
        if (r.type !== 'combiner-component') continue;
        const gestalt = charBySlugGlobal.get(r.entity1.slug);
        expect(
          gestalt?.is_combined_form,
          `Combiner gestalt "${r.entity1.slug}" must have is_combined_form=true`
        ).toBe(true);
      }
    });

    it('is_combined_form=true characters must have combiner-component relationships', () => {
      const gestaltsInRelationships = new Set(
        allRelationships.filter((r) => r.type === 'combiner-component').map((r) => r.entity1.slug)
      );
      for (const c of allCharacters) {
        if (!c.is_combined_form) continue;
        expect(
          gestaltsInRelationships.has(c.slug),
          `Character "${c.slug}" has is_combined_form=true but no combiner-component relationships target it`
        ).toBe(true);
      }
    });

    it('vehicle-crew: entity1 must have character_type=Vehicle', () => {
      for (const r of allRelationships) {
        if (r.type !== 'vehicle-crew') continue;
        const vehicle = charBySlugGlobal.get(r.entity1.slug);
        expect(
          vehicle?.character_type,
          `Vehicle-crew entity1 "${r.entity1.slug}" must have character_type="Vehicle", got "${vehicle?.character_type}"`
        ).toBe('Vehicle');
      }
    });
  });
});
