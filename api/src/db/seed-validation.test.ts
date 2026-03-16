/**
 * Seed data validation tests — validates all JSON files in api/db/seed/
 * for referential integrity, slug format, metadata counts, and structural
 * consistency WITHOUT requiring a database connection.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ─── Path setup ──────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_DIR = path.resolve(__dirname, '../../db/seed')

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReferenceRecord {
  slug: string
  [key: string]: unknown
}

interface SubGroupRecord extends ReferenceRecord {
  faction_slug: string | null
}

interface ToyLineRecord extends ReferenceRecord {
  manufacturer_slug: string
}

interface ReferenceFile<T extends ReferenceRecord = ReferenceRecord> {
  _metadata: { total: number; [key: string]: unknown }
  data: T[]
}

interface CharacterRecord {
  name: string
  slug: string
  franchise: string
  series: string
  continuity: string
  character_type: string
  is_combined_form: boolean
  faction_slug: string | null
  combined_form_slug: string | null
  combiner_role: string | null
  sub_group_slugs: string[]
  component_slugs?: string[]
  [key: string]: unknown
}

interface CharacterFile {
  _metadata: { total_characters: number; [key: string]: unknown }
  characters: CharacterRecord[]
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

function loadRef<T extends ReferenceRecord>(relPath: string): ReferenceFile<T> {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, relPath), 'utf-8')) as ReferenceFile<T>
}

function loadCharFile(relPath: string): CharacterFile {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, relPath), 'utf-8')) as CharacterFile
}

// ─── Load all seed data at module scope ──────────────────────────────────────

const factions = loadRef('reference/factions.json')
const subGroups = loadRef<SubGroupRecord>('reference/sub_groups.json')
const manufacturers = loadRef('reference/manufacturers.json')
const toyLines = loadRef<ToyLineRecord>('reference/toy_lines.json')

const CHARACTER_FILES = [
  'characters/g1-season1.json',
  'characters/g1-season2.json',
  'characters/g1-movie.json',
  'characters/g1-season3.json',
  'characters/g1-season4.json',
  'characters/g1-toy-only.json',
  'characters/jp-headmasters.json',
  'characters/jp-masterforce.json',
  'characters/jp-victory.json',
  'characters/jp-zone.json',
] as const

const charFiles = CHARACTER_FILES.map((f) => ({
  file: f,
  ...loadCharFile(f),
}))

// ─── Derived lookup sets ─────────────────────────────────────────────────────

const factionSlugs = new Set(factions.data.map((r) => r.slug))
const subGroupSlugs = new Set(subGroups.data.map((r) => r.slug))
const manufacturerSlugs = new Set(manufacturers.data.map((r) => r.slug))
const allCharacters = charFiles.flatMap(({ characters }) => characters)
const allCharacterSlugs = new Set(allCharacters.map((c) => c.slug))

// ─── Constants ───────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const VALID_COMBINER_ROLES = new Set([
  'torso', 'right arm', 'left arm', 'right leg', 'left leg',
  'upper torso', 'lower torso', 'upper body', 'lower body',
  'torso (right half)', 'torso (left half)',
  'main body', 'wings/booster', 'weapon', 'back-mounted weapon', 'back',
])

const REQUIRED_CHAR_FIELDS = [
  'name', 'slug', 'franchise', 'series', 'continuity',
  'character_type', 'is_combined_form',
] as const

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('seed data validation', () => {
  // ── 1. Metadata counts ─────────────────────────────────────────────────

  describe('metadata counts', () => {
    it.each([
      { label: 'factions', total: factions._metadata.total, actual: factions.data.length },
      { label: 'sub_groups', total: subGroups._metadata.total, actual: subGroups.data.length },
      { label: 'manufacturers', total: manufacturers._metadata.total, actual: manufacturers.data.length },
      { label: 'toy_lines', total: toyLines._metadata.total, actual: toyLines.data.length },
    ])('$label: _metadata.total matches data array length', ({ label, total, actual }) => {
      expect(actual, `${label}: _metadata.total is ${total} but data has ${actual} entries`).toBe(total)
    })

    it.each(charFiles)(
      '$file: _metadata.total_characters matches characters array length',
      ({ file, _metadata, characters }) => {
        expect(
          characters.length,
          `${file}: _metadata.total_characters is ${_metadata.total_characters} but has ${characters.length} entries`,
        ).toBe(_metadata.total_characters)
      },
    )
  })

  // ── 2. Slug format ─────────────────────────────────────────────────────

  describe('slug format', () => {
    it.each([
      { label: 'factions', records: factions.data },
      { label: 'sub_groups', records: subGroups.data },
      { label: 'manufacturers', records: manufacturers.data },
      { label: 'toy_lines', records: toyLines.data },
    ])('all $label slugs match kebab-case format', ({ label, records }) => {
      for (const r of records) {
        expect(SLUG_RE.test(r.slug), `${label}: invalid slug "${r.slug}"`).toBe(true)
      }
    })

    it.each(charFiles)(
      '$file: all character slugs match kebab-case format',
      ({ file, characters }) => {
        for (const c of characters) {
          expect(SLUG_RE.test(c.slug), `${file} > "${c.name}": invalid slug "${c.slug}"`).toBe(true)
        }
      },
    )
  })

  // ── 3. No duplicate slugs ──────────────────────────────────────────────

  describe('no duplicate slugs', () => {
    it.each([
      { label: 'factions', records: factions.data },
      { label: 'sub_groups', records: subGroups.data },
      { label: 'manufacturers', records: manufacturers.data },
      { label: 'toy_lines', records: toyLines.data },
    ])('$label has no duplicate slugs', ({ label, records }) => {
      const seen = new Set<string>()
      for (const r of records) {
        expect(seen.has(r.slug), `${label}: duplicate slug "${r.slug}"`).toBe(false)
        seen.add(r.slug)
      }
    })

    it.each(charFiles)(
      '$file: no duplicate slugs within file',
      ({ file, characters }) => {
        const seen = new Set<string>()
        for (const c of characters) {
          expect(seen.has(c.slug), `${file}: duplicate slug "${c.slug}" (name: "${c.name}")`).toBe(false)
          seen.add(c.slug)
        }
      },
    )

    it('no duplicate character slugs across all character files', () => {
      const seen = new Map<string, string>()
      for (const { file, characters } of charFiles) {
        for (const c of characters) {
          const existing = seen.get(c.slug)
          expect(
            existing,
            `Slug "${c.slug}" appears in both "${existing}" and "${file}"`,
          ).toBeUndefined()
          seen.set(c.slug, file)
        }
      }
    })
  })

  // ── 4. FK referential integrity ────────────────────────────────────────

  describe('FK referential integrity', () => {
    it('sub_groups: faction_slug resolves to factions', () => {
      for (const sg of subGroups.data) {
        if (sg.faction_slug === null) continue
        expect(
          factionSlugs.has(sg.faction_slug),
          `sub_groups > "${sg.slug}": unknown faction_slug "${sg.faction_slug}"`,
        ).toBe(true)
      }
    })

    it('toy_lines: manufacturer_slug resolves to manufacturers', () => {
      for (const tl of toyLines.data) {
        expect(
          manufacturerSlugs.has(tl.manufacturer_slug),
          `toy_lines > "${tl.slug}": unknown manufacturer_slug "${tl.manufacturer_slug}"`,
        ).toBe(true)
      }
    })

    it.each(charFiles)(
      '$file: faction_slug resolves to factions',
      ({ file, characters }) => {
        for (const c of characters) {
          if (c.faction_slug === null) continue
          expect(
            factionSlugs.has(c.faction_slug),
            `${file} > "${c.name}" (${c.slug}): unknown faction_slug "${c.faction_slug}"`,
          ).toBe(true)
        }
      },
    )

    it.each(charFiles)(
      '$file: sub_group_slugs resolve to sub_groups',
      ({ file, characters }) => {
        for (const c of characters) {
          for (const sgSlug of c.sub_group_slugs) {
            expect(
              subGroupSlugs.has(sgSlug),
              `${file} > "${c.name}" (${c.slug}): unknown sub_group_slug "${sgSlug}"`,
            ).toBe(true)
          }
        }
      },
    )

    it.each(charFiles)(
      '$file: combined_form_slug resolves to a character',
      ({ file, characters }) => {
        for (const c of characters) {
          if (c.combined_form_slug === null) continue
          expect(
            allCharacterSlugs.has(c.combined_form_slug),
            `${file} > "${c.name}" (${c.slug}): unknown combined_form_slug "${c.combined_form_slug}"`,
          ).toBe(true)
        }
      },
    )
    it.each(charFiles)(
      '$file: combiner_role values are valid',
      ({ file, characters }) => {
        for (const c of characters) {
          if (c.combiner_role === null) continue
          expect(
            VALID_COMBINER_ROLES.has(c.combiner_role),
            `${file} > "${c.name}" (${c.slug}): unknown combiner_role "${c.combiner_role}"`,
          ).toBe(true)
        }
      },
    )
  })

  // ── 5. Combiner consistency ────────────────────────────────────────────

  describe('combiner consistency', () => {
    const combinedForms = allCharacters.filter((c) => c.is_combined_form)
    const charBySlug = new Map(allCharacters.map((c) => [c.slug, c]))

    it('combined forms with component_slugs: each component exists', () => {
      for (const form of combinedForms) {
        if (!form.component_slugs) continue
        for (const compSlug of form.component_slugs) {
          expect(
            allCharacterSlugs.has(compSlug),
            `Combined form "${form.slug}": component "${compSlug}" does not exist`,
          ).toBe(true)
        }
      }
    })

    it('combined forms with component_slugs: each component points back', () => {
      for (const form of combinedForms) {
        if (!form.component_slugs) continue
        for (const compSlug of form.component_slugs) {
          const comp = charBySlug.get(compSlug)
          if (!comp) continue // caught by previous test
          expect(
            comp.combined_form_slug,
            `"${compSlug}" is in "${form.slug}".component_slugs but has combined_form_slug "${comp.combined_form_slug}"`,
          ).toBe(form.slug)
        }
      }
    })

    it('characters with combined_form_slug: target has is_combined_form=true', () => {
      for (const c of allCharacters) {
        if (c.combined_form_slug === null) continue
        const form = charBySlug.get(c.combined_form_slug)
        expect(
          form?.is_combined_form,
          `"${c.slug}" has combined_form_slug "${c.combined_form_slug}" but that character has is_combined_form=${form?.is_combined_form}`,
        ).toBe(true)
      }
    })

    it('characters with combined_form_slug: listed in form\'s component_slugs when present', () => {
      for (const c of allCharacters) {
        if (c.combined_form_slug === null) continue
        const form = charBySlug.get(c.combined_form_slug)
        if (!form?.component_slugs) continue
        expect(
          form.component_slugs.includes(c.slug),
          `"${c.slug}" points to "${c.combined_form_slug}" but is not in its component_slugs`,
        ).toBe(true)
      }
    })
  })

  // ── 6. Required character fields ───────────────────────────────────────

  describe('required character fields', () => {
    it.each(charFiles)(
      '$file: all characters have required fields',
      ({ file, characters }) => {
        for (const c of characters) {
          for (const field of REQUIRED_CHAR_FIELDS) {
            expect(
              field in c,
              `${file} > "${c.slug}": missing required field "${field}"`,
            ).toBe(true)
          }
          expect(
            Array.isArray(c.sub_group_slugs),
            `${file} > "${c.slug}": sub_group_slugs must be an array`,
          ).toBe(true)
        }
      },
    )
  })

  // ── 7. Name + franchise + continuity uniqueness ────────────────────────

  describe('name + franchise + continuity uniqueness', () => {
    it('no two characters share the same (name, franchise, continuity)', () => {
      const seen = new Map<string, string>()
      for (const { file, characters } of charFiles) {
        for (const c of characters) {
          const key = `${c.name.toLowerCase()}|||${c.franchise.toLowerCase()}|||${c.continuity}`
          const existing = seen.get(key)
          expect(
            existing,
            `Duplicate: "${c.name}" / "${c.franchise}" / "${c.continuity}" in "${file}" — already in "${existing}"`,
          ).toBeUndefined()
          seen.set(key, `${file} > ${c.slug}`)
        }
      }
    })
  })
})
