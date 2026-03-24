# INT: Seed Data Sync

## Background

Given the seed sync script is available
And migration 031 has been applied (updated_at on reference + relationship tables)
And the database has been seeded with sample data

## Scenarios

### Push: Seed Newer Than DB

```gherkin
Scenario: Push upserts a record when seed last_modified is newer than DB updated_at
  Given a franchise "transformers" exists in both seed JSON and DB
  And the seed record has last_modified "2026-03-23T12:00:00.000Z"
  And the DB record has updated_at "2026-03-20T00:00:00.000Z"
  When sync:push runs
  Then the DB record is updated with the seed data
  And the seed record's last_modified is stamped to the DB's new updated_at
```

### Push: DB Newer Than Seed

```gherkin
Scenario: Push skips a record when DB updated_at is newer than seed last_modified
  Given a character "optimus-prime" exists in both seed JSON and DB
  And the seed record has last_modified "2026-03-20T00:00:00.000Z"
  And the DB record has updated_at "2026-03-23T12:00:00.000Z"
  When sync:push runs
  Then the DB record is not modified
  And the push log shows the record was skipped
```

### Push: Missing last_modified Treated as Infinitely Old

```gherkin
Scenario: Push skips records with no last_modified field
  Given a character "bumblebee" exists in both seed JSON and DB
  And the seed record has no last_modified field
  And the DB record has updated_at "2026-03-20T00:00:00.000Z"
  When sync:push runs
  Then the DB record is not modified
```

### Push: New Seed Record Inserts to DB

```gherkin
Scenario: Push inserts a record that exists in seed but not in DB
  Given a character "starscream" exists in seed JSON
  And no "starscream" record exists in the DB
  When sync:push runs
  Then a new character record is inserted into the DB
  And the seed record's last_modified is stamped
```

### Push: Character Sub-Groups Rebuilt

```gherkin
Scenario: Push rebuilds character_sub_groups junction when character is pushed
  Given a character "bumblebee" with sub_group_slugs ["minibots"] in seed
  And the seed record is newer than DB
  When sync:push runs
  Then the character is upserted
  And character_sub_groups are deleted and re-inserted for "bumblebee"
```

### Pull: DB Newer Than Seed

```gherkin
Scenario: Pull updates seed record when DB updated_at is newer
  Given a manufacturer "hasbro" exists in both seed JSON and DB
  And the DB record has updated_at "2026-03-23T12:00:00.000Z"
  And the seed record has last_modified "2026-03-20T00:00:00.000Z"
  And the DB record has name "Hasbro Inc."
  When sync:pull runs
  Then the seed JSON record's name is updated to "Hasbro Inc."
  And the seed record's last_modified is set to "2026-03-23T12:00:00.000Z"
  And _metadata.total remains accurate
```

### Pull: Seed Newer Than DB

```gherkin
Scenario: Pull skips a record when seed last_modified is newer than DB updated_at
  Given a faction "autobot" exists in both seed JSON and DB
  And the seed record has last_modified "2026-03-23T12:00:00.000Z"
  And the DB record has updated_at "2026-03-20T00:00:00.000Z"
  When sync:pull runs
  Then the seed JSON record is not modified
```

### Pull: New DB Record Appended to Seed File

```gherkin
Scenario: Pull appends a DB-only record to the appropriate seed file
  Given a character "jazz" exists in the DB but not in any seed file
  And "jazz" has franchise_slug "transformers"
  When sync:pull runs
  Then "jazz" is appended to a character seed file
  And the appended record has last_modified set to the DB updated_at
  And _metadata.total_characters is incremented
```

### Pull: Character Metadata Disassembled

```gherkin
Scenario: Pull extracts notes, series_year, year_released from character metadata JSONB
  Given a character "optimus-prime" in the DB has metadata {"notes": "Updated note", "series_year": "1984"}
  And the DB record is newer than seed
  When sync:pull runs
  Then the seed record has notes "Updated note" as a top-level field
  And the seed record has series_year "1984" as a top-level field
```

### Pull: Item Depiction Recovered

```gherkin
Scenario: Pull recovers character_slug and character_appearance_slug for items
  Given an item "05701-bumblebee" in the DB with a primary depiction
  And the depiction links to appearance "bumblebee-g1-cartoon" for character "bumblebee"
  And the DB record is newer than seed
  When sync:pull runs
  Then the seed record has character_slug "bumblebee"
  And the seed record has character_appearance_slug "bumblebee-g1-cartoon"
```

### Pull: Sub-Group Slugs Recovered

```gherkin
Scenario: Pull recovers sub_group_slugs array for characters
  Given a character "bumblebee" in the DB is linked to sub_group "minibots" via junction
  And the DB record is newer than seed
  When sync:pull runs
  Then the seed record has sub_group_slugs ["minibots"]
```

### Deletion Warnings: Seed-Only Record

```gherkin
Scenario: Sync warns about records in seed but not in DB
  Given a character "unicron" exists in seed JSON
  And no "unicron" record exists in the DB
  When sync:pull runs
  Then a warning is logged: "seed-only: characters > unicron"
  And the seed record is not deleted
```

### Deletion Warnings: DB-Only Record

```gherkin
Scenario: Sync warns about records in DB but not in seed (during push)
  Given a manufacturer "takara" exists in the DB
  And no "takara" record exists in seed JSON
  When sync:push runs
  Then a warning is logged: "db-only: manufacturers > takara"
  And the DB record is not deleted
```

### Full Sync: Timestamps Converge

```gherkin
Scenario: After a full sync, all timestamps match between seed and DB
  Given seed files with various last_modified values
  And DB records with various updated_at values
  When sync (push + pull) runs
  Then every record present in both seed and DB has matching timestamps
  And a second sync run produces no changes (idempotent)
```

### Atomic Writes: Push Buffers Until Commit

```gherkin
Scenario: Push does not modify seed files if DB transaction fails
  Given a seed record that is newer than DB
  And the DB upsert will fail (e.g., FK constraint violation)
  When sync:push runs
  Then the DB transaction is rolled back
  And the seed JSON files are not modified
```

### JSON File Integrity

```gherkin
Scenario: Pull writes use atomic file operations
  Given a pull will update records in franchises.json
  When sync:pull writes the file
  Then the file is written to a .tmp path first
  And then renamed atomically to the target path
  And the file has 2-space JSON indentation with trailing newline
```

### Relationship Sync

```gherkin
Scenario: Push syncs character relationships with timestamp check
  Given a character relationship (combiner-component, devastator, scrapper) in seed
  And the seed record has last_modified newer than DB updated_at
  When sync:push runs
  Then the character_relationships record is upserted
```

```gherkin
Scenario: Pull recovers character relationships with entity slugs
  Given a character relationship in DB between entity1_id and entity2_id
  And the DB record is newer than seed
  When sync:pull runs
  Then the seed record has entity1.slug and entity2.slug resolved from UUIDs
```
