# INT: Seed Data Ingestion

## Background

Given a running PostgreSQL database with all migrations applied
And the seed JSON files exist in `api/db/seed/`

## Scenarios

### Happy Path: Row Counts After Seed

```gherkin
Scenario: All catalog tables have expected row counts after seed:purge
  Given the database is empty
  When the seed ingestion script runs with --purge --confirm
  Then continuity_families has 10 rows
  And factions has 11 rows
  And sub_groups has 52 rows
  And manufacturers has 3 rows
  And toy_lines has 16 rows
  And characters has 440 rows
  And character_appearances has 508 rows
  And items has 395 rows
```

### Integrity: No Duplicate Slugs

```gherkin
Scenario: All slug-bearing tables have unique slugs
  Given the seed has been ingested
  Then no table has duplicate slug values
```

### Integrity: FK References Are Valid

```gherkin
Scenario: All foreign key references resolve to existing rows
  Given the seed has been ingested
  Then all characters.faction_id values reference valid factions
  And all characters.continuity_family_id values reference valid continuity_families
  And all characters.combined_form_id values reference valid characters
  And all character_sub_groups entries reference valid characters and sub_groups
  And all character_appearances.character_id values reference valid characters
  And all sub_groups.faction_id values reference valid factions
  And all toy_lines.manufacturer_id values reference valid manufacturers
  And all items.manufacturer_id values reference valid manufacturers
  And all items.toy_line_id values reference valid toy_lines
  And all items.character_id values reference valid characters
  And all items.character_appearance_id values reference valid character_appearances
```

### Domain: Combiner Relationships

```gherkin
Scenario: Devastator has exactly 6 Constructicon components
  Given the seed has been ingested
  When querying characters with combined_form_id pointing to Devastator
  Then exactly 6 components are found
  And they are bonecrusher, hook, long-haul, mixmaster, scavenger, scrapper

Scenario: Other combiners have expected component counts
  Given the seed has been ingested
  Then Superion has 5 components
  And Menasor has 5 components
  And Bruticus has 5 components
  And Defensor has 5 components

Scenario: All combined_form_id targets are marked as combined forms
  Given the seed has been ingested
  Then every character with a combined_form_id points to a character with is_combined_form = true
```

### Domain: Junction Table Multi-Group Membership

```gherkin
Scenario: Apeface belongs to both headmasters and horrorcons
  Given the seed has been ingested
  When querying character_sub_groups for Apeface
  Then the result includes both headmasters and horrorcons sub-groups
```

### Domain: Item Data Correctness

```gherkin
Scenario: FansToys items are marked as third-party
  Given the seed has been ingested
  Then all items with manufacturer slug "fanstoys" have is_third_party = true
  And the FansToys item count is 118

Scenario: Hasbro items are marked as official
  Given the seed has been ingested
  Then all items with manufacturer slug "hasbro" have is_third_party = false
  And the Hasbro item count is 277

Scenario: FT-01 MP-1 Trailer spot-check
  Given the seed has been ingested
  When querying the item with slug "ft-01-mp-1-trailer"
  Then is_third_party is true
  And manufacturer_slug is "fanstoys"
  And character_slug is "optimus-prime"
  And metadata contains status and sub_brand fields
```

### Idempotency: Re-Seed Produces Same Results

```gherkin
Scenario: Purge and re-seed produces identical row counts
  Given the seed has been ingested once
  When the seed script runs again with --purge --confirm
  Then all table row counts are unchanged
  And no orphaned rows exist
```

### Guard: Graceful Skip Without Database

```gherkin
Scenario: Tests skip when DATABASE_URL is not set
  Given DATABASE_URL is not in the environment
  When the test suite runs
  Then the seed integration tests are skipped without failure
```
