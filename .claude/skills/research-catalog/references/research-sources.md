# Research Sources Reference

Authoritative sources, URL patterns, and research discipline for Transformers seed data.
Read this file when a work unit requires web research for new characters or items.

## Table of Contents

- [Source Authority by Data Type](#source-authority-by-data-type)
- [TFWiki (tfwiki.net)](#tfwiki)
- [TFArchive (tfarchive.com)](#tfarchive)
- [Third-Party Manufacturer Sources](#third-party-manufacturer-sources)
- [Fallback: Web Search](#fallback-web-search)
- [Research Discipline](#research-discipline)

---

## Source Authority by Data Type

| Data type | Primary source | Notes |
| --- | --- | --- |
| Character data (faction, alt mode, continuity, sub-groups) | **tfwiki.net** | Authoritative for character lore |
| Hasbro product codes / item numbers | **TFArchive** | TFWiki does NOT have Hasbro stock numbers |
| Takara catalog numbers | **tfwiki.net** | Only Takara numbers, not Hasbro |
| Third-party item data | Manufacturer pages, TFW2005, Seibertron | TFWiki coverage is sparse |
| Visual/appearance descriptions | Derive from seed data | TFWiki articles are narrative, not visual |

---

## TFWiki

### URL patterns

Base: `https://tfwiki.net/wiki/{EntityName}`

- Title-case with underscores: `Optimus_Prime`, `Stunticons`, `Beast_Wars`
- Disambiguation: append continuity in parentheses:
  `Optimus_Prime_(G1)`, `Megatron_(BW)`, `Starscream_(Armada)`
- Category pages (for bulk character lists):
  `https://tfwiki.net/wiki/Category:Beast_Wars_characters`

### Caveats

- **Subpage paths return 404**: `/cartoon`, `/toys`, `/Generation_1` do not work. Use only the
  main page URL.
- **Narrative-focused content**: Articles are plot summaries, not visual descriptions. Visual
  design info is in images that WebFetch cannot process.
- **No Hasbro product codes**: TFWiki documents Takara catalog numbers only.
- **Disambiguation suffixes**: `(G1)`, `(BW)`, `(Armada)`, `(Animated)`, `(Prime)`,
  `(Cyberverse)`, `(EarthSpark)`

### What to extract from TFWiki

- **Characters**: faction, alt mode, sub-group membership, combiner role, combined form,
  continuity family, character type, first appearance context (for notes)
- **Items**: Takara product codes only, release year, size class, character depicted

---

## TFArchive

### URL pattern

Hasbro product code reference:
```
https://www.tfarchive.com/toys/references/product_code_numbers.php
```

This single page has comprehensive Hasbro 5-digit product codes organized by year (1984-1993).

### Caveats

- **Year sections = code assignment year**, which may not match retail availability.
  E.g., Blaster cassettes coded in 1985 but shipped in 1986.
- **Some items only have assortment-level codes** shared by multiple characters in a shipping
  case. Flag these in metadata notes.
- **Major items may be missing**: Fortress Maximus, Trypticon, some combiner giftsets.
  Use `"UNKNOWN"` product_code with `hasbro-{name}-g1` slug format when undocumented.
- **1990 Action Master codes reuse the 057xx range** from 1984. Slugs disambiguate via
  character name (e.g., `05751-sunstreaker` vs `05751-wheeljack-action-master`).
- **Product code scheme**: 057xx cars, 058xx jets, 059xx minibots/cassettes. Later years
  (1988-1990) introduced 055xx for Micromasters/Pretenders.

---

## Third-Party Manufacturer Sources

For third-party items, TFWiki coverage is sparse. Use these sources:

1. **Manufacturer product pages**: Official product listings with codes, names, release dates
2. **TFW2005.com wiki**: Community-maintained product databases
3. **Seibertron.com galleries**: Product photos and release information
4. **Fan databases**: For comprehensive product catalogs of specific manufacturers

When researching a new manufacturer:
- Search for their official website/social media for a complete product catalog
- Cross-reference with TFW2005 for release dates and community names
- Note any product numbering scheme (e.g., FansToys uses FT-XX, X-Transbots uses MX-XX)

---

## Fallback: Web Search

When the primary source is missing or sparse, use WebSearch:

### Search patterns

- **Characters**: `"{CharacterName}" Transformers {continuity} character faction alt-mode site:tfwiki.net`
- **Items**: `"{ManufacturerName}" "{ProductCode}" third party Transformers masterpiece`
- **Hasbro product codes**: `"{CharacterName}" Hasbro product code G1 Transformers 1984`
- **Manufacturer catalogs**: `"{ManufacturerName}" Transformers product list complete catalog`

### Fallback chain

```
Primary source (TFWiki / TFArchive / manufacturer page)
  → Alternate URL (disambiguation suffix, different page)
    → Web search (site-scoped first, then general)
      → Mark as UNCERTAIN (never fabricate)
```

---

## Research Discipline

1. **Record your source URL** for every data point when web-fetching.
2. **When sources conflict**, flag in the `notes` field:
   `"UNCERTAIN: tfwiki says X, TFW2005 says Y"`.
3. **Release years**: use the first mass-retail release date.
4. **Never fabricate data** you cannot source. Set unconfirmable data to `null` and add a note.
5. **Appearance descriptions**: derive from the character's known alt_mode, faction colors,
   and distinctive design features. These are factual descriptions of well-documented
   fictional character designs — not fabricated data. Do NOT web-fetch per-character for
   appearance-only requests.
6. **Never fetch authenticated URLs** or include credentials in URLs.
7. **Never store raw HTML** in seed files — extract only structured data.
8. **Bulk over individual**: prefer category/list pages over individual character pages. One
   fetch of a category page is better than 40 individual fetches.
