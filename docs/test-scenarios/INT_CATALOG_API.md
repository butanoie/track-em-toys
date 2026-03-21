# INT: Catalog API Routes

## Background

Given the API server is running
And the catalog database is seeded with test data
And no authentication is required for catalog reads

## Scenarios

### Franchise List

#### Happy Path: List All Franchises

```gherkin
Scenario: List all franchises
  When the client sends GET /catalog/franchises
  Then a 200 response is returned
  And the response contains all franchises ordered by sort_order ASC NULLS LAST
  And each franchise has id, slug, name, sort_order, notes
```

#### Happy Path: Franchise Detail

```gherkin
Scenario: Get franchise by slug
  When the client sends GET /catalog/franchises/transformers
  Then a 200 response is returned
  And the response contains the Transformers franchise detail
```

#### Error: Franchise Not Found

```gherkin
Scenario: Franchise slug does not exist
  When the client sends GET /catalog/franchises/nonexistent
  Then a 404 response is returned
  And the error message is "Franchise not found"
```

---

### Characters (Franchise-Scoped)

#### Happy Path: List Characters with Pagination

```gherkin
Scenario: List characters in a franchise with cursor pagination
  When the client sends GET /catalog/franchises/transformers/characters?limit=5
  Then a 200 response is returned
  And data contains at most 5 characters
  And each character has id, name, slug, franchise, faction, continuity_family, character_type, alt_mode, is_combined_form
  And next_cursor is a non-null string if more results exist
  And total_count reflects the total characters in this franchise
```

#### Happy Path: Paginate with Cursor

```gherkin
Scenario: Fetch next page using cursor
  Given the client has fetched page 1 and received a next_cursor
  When the client sends GET /catalog/franchises/transformers/characters?cursor=<next_cursor>
  Then a 200 response is returned
  And data contains the next page of characters
  And no characters from page 1 appear in page 2
```

#### Happy Path: Character Detail

```gherkin
Scenario: Get character detail by slug within franchise
  When the client sends GET /catalog/franchises/transformers/characters/optimus-prime
  Then a 200 response is returned
  And the response includes franchise, faction, continuity_family as { slug, name } objects
  And the response includes sub_groups as an array of { slug, name }
  And the response includes appearances as an array with id, slug, name, source_media, source_name, year_start, year_end, description
  And the response includes is_combined_form boolean
  And the response includes metadata, created_at, updated_at
  And combiner_role, combined_form, and component_characters are NOT in the response (moved to relationships endpoint)
```

#### Error: Character Not Found

```gherkin
Scenario: Character slug does not exist in this franchise
  When the client sends GET /catalog/franchises/transformers/characters/nonexistent
  Then a 404 response is returned
  And the error message is "Character not found"
```

#### Error: Character Exists in Different Franchise

```gherkin
Scenario: Character slug exists but in a different franchise
  Given "optimus-prime" exists in the "transformers" franchise
  When the client sends GET /catalog/franchises/gi-joe/characters/optimus-prime
  Then a 404 response is returned
  And the error message is "Character not found"
```

#### Error: Invalid Franchise

```gherkin
Scenario: Franchise slug does not exist
  When the client sends GET /catalog/franchises/nonexistent/characters
  Then a 404 response is returned
  And the error message is "Franchise not found"
```

#### Error: Invalid Cursor

```gherkin
Scenario: Malformed cursor string
  When the client sends GET /catalog/franchises/transformers/characters?cursor=not-valid-base64
  Then a 400 response is returned
  And the error message is "Invalid cursor"
```

#### Edge: Empty Result Set

```gherkin
Scenario: Franchise has no characters
  Given a franchise with no seeded characters
  When the client sends GET /catalog/franchises/<empty-franchise>/characters
  Then a 200 response is returned
  And data is an empty array
  And next_cursor is null
  And total_count is 0
```

---

### Items (Franchise-Scoped)

#### Happy Path: List Items with Pagination

```gherkin
Scenario: List items in a franchise with cursor pagination
  When the client sends GET /catalog/franchises/transformers/items?limit=10
  Then a 200 response is returned
  And each item has id, name, slug, franchise, characters, manufacturer, toy_line, size_class, year_released, is_third_party, data_quality
  And characters is an array where each entry has slug, name, appearance_slug, is_primary
  And next_cursor is present if more results exist
  And total_count reflects total items in this franchise
```

#### Happy Path: Item Detail

```gherkin
Scenario: Get item detail by slug within franchise
  When the client sends GET /catalog/franchises/transformers/items/ft-44-thomas
  Then a 200 response is returned
  And the response includes characters as an array of { slug, name, appearance_slug, appearance_name, is_primary }
  And the response includes manufacturer, toy_line, franchise as { slug, name } objects
  And the response includes photos as an array with id, url, caption, is_primary
  And the response includes description, barcode, sku, product_code, metadata, created_at, updated_at
```

#### Error: Item Not Found

```gherkin
Scenario: Item slug does not exist in this franchise
  When the client sends GET /catalog/franchises/transformers/items/nonexistent
  Then a 404 response is returned
```

---

### Manufacturers (Unscoped)

#### Happy Path: List All Manufacturers

```gherkin
Scenario: List all manufacturers
  When the client sends GET /catalog/manufacturers
  Then a 200 response is returned
  And the response contains all manufacturers
  And each manufacturer has id, name, slug, is_official_licensee, country, website_url, aliases, notes
```

#### Happy Path: Manufacturer Detail

```gherkin
Scenario: Get manufacturer by slug
  When the client sends GET /catalog/manufacturers/fanstoys
  Then a 200 response is returned
  And the response contains the FansToys manufacturer detail
```

#### Error: Manufacturer Not Found

```gherkin
Scenario: Manufacturer slug does not exist
  When the client sends GET /catalog/manufacturers/nonexistent
  Then a 404 response is returned
```

---

### Toy Lines (Franchise-Scoped)

#### Happy Path: List Toy Lines

```gherkin
Scenario: List toy lines in a franchise
  When the client sends GET /catalog/franchises/transformers/toy-lines
  Then a 200 response is returned
  And each toy line has id, name, slug, franchise, manufacturer, scale, description
  And results are ordered by name ASC
```

#### Happy Path: Toy Line Detail

```gherkin
Scenario: Get toy line by slug within franchise
  When the client sends GET /catalog/franchises/transformers/toy-lines/masterpiece
  Then a 200 response is returned
```

---

### Reference Data (Franchise-Scoped)

#### Happy Path: List Factions

```gherkin
Scenario: List factions in a franchise
  When the client sends GET /catalog/franchises/transformers/factions
  Then a 200 response is returned
  And results are ordered by sort_order ASC NULLS LAST, name ASC
```

#### Happy Path: List Sub-Groups

```gherkin
Scenario: List sub-groups in a franchise
  When the client sends GET /catalog/franchises/transformers/sub-groups
  Then a 200 response is returned
  And each sub-group has id, name, slug, faction (nullable { slug, name }), notes
```

#### Happy Path: List Continuity Families

```gherkin
Scenario: List continuity families in a franchise
  When the client sends GET /catalog/franchises/transformers/continuity-families
  Then a 200 response is returned
  And results are ordered by sort_order ASC NULLS LAST
```

#### Happy Path: Reference Detail

```gherkin
Scenario: Get faction by slug within franchise
  When the client sends GET /catalog/franchises/transformers/factions/autobot
  Then a 200 response is returned
  And the response contains the Autobot faction detail
```

#### Error: Reference Not Found in Franchise

```gherkin
Scenario: Faction exists but not in this franchise
  Given "autobot" exists in the "transformers" franchise
  When the client sends GET /catalog/franchises/gi-joe/factions/autobot
  Then a 404 response is returned
```

---

### Search (Unscoped)

#### Happy Path: Full-Text Search

```gherkin
Scenario: Search across characters and items
  When the client sends GET /catalog/search?q=optimus
  Then a 200 response is returned
  And data contains results with entity_type "character" or "item"
  And each result has id, name, slug, franchise { slug, name }
  And results are ordered by relevance (rank DESC)
  And page, limit, total_count are present in the response
```

#### Happy Path: Search with Franchise Filter

```gherkin
Scenario: Search within a specific franchise
  When the client sends GET /catalog/search?q=optimus&franchise=transformers
  Then all results belong to the Transformers franchise
```

#### Happy Path: Prefix Search

```gherkin
Scenario: Partial word matches via prefix search
  When the client sends GET /catalog/search?q=opti
  Then results include "Optimus Prime" (prefix match on last token)
```

#### Happy Path: Search Pagination

```gherkin
Scenario: Paginate search results with offset
  When the client sends GET /catalog/search?q=transformer&page=2&limit=5
  Then data contains at most 5 results
  And page is 2 and limit is 5
  And total_count reflects the total matching results
```

#### Edge: No Results

```gherkin
Scenario: Search query matches nothing
  When the client sends GET /catalog/search?q=zzzznonexistent
  Then a 200 response is returned
  And data is an empty array
  And total_count is 0
```

#### Edge: Punctuation-Only Query

```gherkin
Scenario: Query is all punctuation
  When the client sends GET /catalog/search?q=!!!
  Then a 200 response is returned
  And data is an empty array
  And total_count is 0
```

#### Error: Missing Query

```gherkin
Scenario: No q parameter provided
  When the client sends GET /catalog/search
  Then a 400 response is returned
```

#### Error: Empty Query

```gherkin
Scenario: Empty q parameter
  When the client sends GET /catalog/search?q=
  Then a 400 response is returned
```

---

### Rate Limiting

#### All Catalog Routes

```gherkin
Scenario: Rate limit headers present
  When the client sends any catalog request
  Then rate limit headers are present in the response
  And the limit is 100 requests per minute
```
