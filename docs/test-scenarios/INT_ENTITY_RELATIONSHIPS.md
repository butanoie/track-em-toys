# INT: Entity Relationships

## Background

Given the API server is running
And the catalog database is seeded with test data
And no authentication is required for catalog reads

## Scenarios

### Seed Ingestion: Character Relationships

```gherkin
Scenario: Character relationships are ingested from seed files
  Given the seed has been ingested
  Then character_relationships has rows matching the seed file totals
  And all entity1_id values reference valid characters
  And all entity2_id values reference valid characters
  And no relationship has entity1_id = entity2_id

Scenario: Relationship types match the registry
  Given the seed has been ingested
  Then all character_relationships.type values are one of:
    combiner-component, partner-bond, vehicle-crew, rival, sibling, mentor-student, evolution

Scenario: No duplicate relationship tuples
  Given the seed has been ingested
  Then no two rows share the same (type, entity1_id, entity2_id)
```

### Seed Ingestion: Item Character Depictions

```gherkin
Scenario: Every item has at least one depiction row
  Given the seed has been ingested
  Then every item has at least one row in item_character_depictions
  And exactly one depiction per item is marked is_primary = true

Scenario: Depiction appearance belongs to the expected character
  Given the seed has been ingested
  Then for each depiction, the appearance's character_id matches the
    character referenced by the item's original character_slug

Scenario: Depiction FK integrity
  Given the seed has been ingested
  Then all item_character_depictions.item_id values reference valid items
  And all item_character_depictions.appearance_id values reference valid character_appearances
```

### API: Character Relationships Endpoint

```gherkin
Scenario: Get relationships for a character
  When the client sends GET /catalog/franchises/transformers/characters/scrapper/relationships
  Then a 200 response is returned
  And the response contains { relationships: [...] }
  And each relationship has type, subtype, role, related_character: { slug, name }, metadata

Scenario: Character with no relationships returns empty array
  When the client sends GET /catalog/franchises/transformers/characters/<char-without-rels>/relationships
  Then a 200 response is returned
  And relationships is an empty array

Scenario: Character not found returns 404
  When the client sends GET /catalog/franchises/transformers/characters/nonexistent/relationships
  Then a 404 response is returned
  And the error message is "Character not found"

Scenario: Relationships include both directions
  Given Scrapper has a combiner-component relationship with Devastator
  When the client sends GET /catalog/franchises/transformers/characters/scrapper/relationships
  Then the response includes a relationship with related_character.slug = "devastator"
  When the client sends GET /catalog/franchises/transformers/characters/devastator/relationships
  Then the response includes a relationship with related_character.slug = "scrapper"
```

### API: Item Relationships Endpoint

```gherkin
Scenario: Get relationships for an item (empty — no data yet)
  When the client sends GET /catalog/franchises/transformers/items/<item-slug>/relationships
  Then a 200 response is returned
  And relationships is an empty array

Scenario: Item not found returns 404
  When the client sends GET /catalog/franchises/transformers/items/nonexistent/relationships
  Then a 404 response is returned
  And the error message is "Item not found"
```

### API: Item List Returns Characters Array

```gherkin
Scenario: Item list includes characters array instead of single character
  When the client sends GET /catalog/franchises/transformers/items?limit=5
  Then a 200 response is returned
  And each item has a characters array
  And each character in the array has slug, name, appearance_slug, is_primary
  And at least one character in each item's array has is_primary = true

Scenario: Item detail includes characters array with appearance info
  When the client sends GET /catalog/franchises/transformers/items/<item-slug>
  Then a 200 response is returned
  And the response has a characters array (not a single character object)
  And each character has slug, name, appearance_slug, appearance_name, is_primary

Scenario: Character filter works through depictions junction
  When the client sends GET /catalog/franchises/transformers/items?character=bumblebee
  Then a 200 response is returned
  And all returned items have a characters array containing a character with slug "bumblebee"
```

### Web UI: Combiner Sibling Expansion (Issue #86)

```gherkin
Background:
  Given the CharacterRelationships component is rendered
  And the character is a combiner component (e.g., Scrapper)
  And the primary fetch returns a combiner-component relationship with role "gestalt"

Scenario: Sibling components are listed under the gestalt heading
  When the secondary fetch for the gestalt's relationships resolves
  Then the combiner section heading is the gestalt's name (e.g., "Devastator")
  And the heading is a clickable link to the gestalt's character page
  And all combiner components are listed alphabetically

Scenario: Current character appears in the siblings list as selected
  When the secondary fetch resolves
  Then the current character appears in the list with aria-current="true"
  And the current character's link has visually distinct styling (muted foreground, font-medium)
  And the current character's body-part role is shown in parentheses

Scenario: Other siblings are normal links
  When the secondary fetch resolves
  Then sibling characters (not the current one) render as standard primary-color links
  And each sibling's body-part role is shown in parentheses

Scenario: Gestalt entry shown as fallback while loading
  When the secondary fetch has not yet resolved
  Then the primary combiner-component entry (gestalt with role "gestalt") is shown
  And once the secondary fetch resolves, it is replaced with the full siblings list

Scenario: Gestalt character page shows components normally
  Given the character is a gestalt (e.g., Devastator)
  And the primary fetch returns combiner-component relationships with body-part roles
  Then the section heading is "Combiner Components" (standard heading)
  And no secondary fetch is triggered
  And all components are listed as standard links

Scenario: Non-combiner relationship groups are unaffected
  Given the character has both combiner-component and rival relationships
  When the combiner expansion occurs
  Then the rival group renders unchanged with standard heading and links
```

### Idempotency

```gherkin
Scenario: Re-seed produces identical relationship and depiction counts
  Given the seed has been ingested
  When the seed script runs again with --purge --confirm
  Then character_relationships row count is unchanged
  And item_character_depictions row count is unchanged
```
