# INT: Collection API Routes

## Background

Given the API server is running
And the user is authenticated with a valid JWT
And all collection queries use RLS (user can only see their own rows)

## Scenarios

### List Collection (GET /collection)

#### Happy Path: Empty Collection

```gherkin
Scenario: List collection with no items
  When the client sends GET /collection with a valid auth token
  Then a 200 response is returned
  And the response has data: [], next_cursor: null, total_count: 0
```

#### Happy Path: List with Items

```gherkin
Scenario: List collection with items
  Given the user has items in their collection
  When the client sends GET /collection with a valid auth token
  Then a 200 response is returned
  And each item has id, item_id, item_name, item_slug, franchise, manufacturer, toy_line, thumbnail_url, condition, notes, created_at, updated_at
  And franchise is a { slug, name } object
  And manufacturer is { slug, name } or null
```

#### Happy Path: Filter by Franchise

```gherkin
Scenario: Filter collection by franchise
  When the client sends GET /collection?franchise=transformers
  Then only items from the Transformers franchise are returned
```

#### Happy Path: Filter by Condition

```gherkin
Scenario: Filter collection by condition
  When the client sends GET /collection?condition=mint_sealed
  Then only items with condition "mint_sealed" are returned
```

#### Happy Path: Search via FTS

```gherkin
Scenario: Search collection items
  When the client sends GET /collection?search=optimus
  Then items matching the search term via full-text search are returned
```

#### Happy Path: Cursor Pagination

```gherkin
Scenario: Paginate through collection
  Given the user has more items than the page limit
  When the client sends GET /collection?limit=5
  Then a 200 response is returned with next_cursor populated
  When the client sends GET /collection?limit=5&cursor={next_cursor}
  Then the next page of results is returned
```

#### Happy Path: Null Manufacturer

```gherkin
Scenario: Item with no manufacturer returns null
  Given an item in the collection has no manufacturer
  When the client sends GET /collection
  Then the item's manufacturer field is null
```

#### Error: Unauthenticated

```gherkin
Scenario: List collection without auth
  When the client sends GET /collection without an auth token
  Then a 401 response is returned
```

---

### Add to Collection (POST /collection)

#### Happy Path: Add with Defaults

```gherkin
Scenario: Add item with only item_id
  When the client sends POST /collection with { item_id: "<valid-uuid>" }
  Then a 201 response is returned
  And the item's condition defaults to "unknown"
  And the item's notes is null
```

#### Happy Path: Add with Condition and Notes

```gherkin
Scenario: Add item with condition and notes
  When the client sends POST /collection with { item_id, condition: "opened_complete", notes: "Great condition" }
  Then a 201 response is returned
  And the response includes the full joined item data
```

#### Happy Path: Multiple Copies Allowed

```gherkin
Scenario: Add the same catalog item twice
  When the client sends POST /collection with { item_id: "<uuid>" }
  And the client sends POST /collection with the same item_id
  Then both return 201
  And the two collection entries have different IDs
```

#### Error: Item Not Found

```gherkin
Scenario: Add non-existent catalog item
  When the client sends POST /collection with { item_id: "<non-existent-uuid>" }
  Then a 404 response is returned with error "Catalog item not found"
```

#### Error: Missing item_id

```gherkin
Scenario: Add without item_id
  When the client sends POST /collection with {}
  Then a 400 response is returned
```

#### Error: Invalid Condition

```gherkin
Scenario: Add with invalid condition value
  When the client sends POST /collection with { item_id, condition: "invalid" }
  Then a 400 response is returned
```

#### Error: Unauthenticated

```gherkin
Scenario: Add to collection without auth
  When the client sends POST /collection without an auth token
  Then a 401 response is returned
```

#### Error: Wrong Content-Type

```gherkin
Scenario: Add with non-JSON content-type
  When the client sends POST /collection with Content-Type: text/plain
  Then a 415 response is returned
```

---

### Collection Stats (GET /collection/stats)

#### Happy Path: Non-Empty Stats

```gherkin
Scenario: Get collection statistics
  Given the user has items in their collection
  When the client sends GET /collection/stats
  Then a 200 response is returned
  And the response has total_copies, unique_items, by_franchise[], by_condition[]
  And total_copies equals the sum of all by_condition[].count
```

#### Happy Path: Empty Collection Stats

```gherkin
Scenario: Get stats for empty collection
  Given the user has no items in their collection
  When the client sends GET /collection/stats
  Then a 200 response is returned
  And total_copies is 0, unique_items is 0
  And by_franchise and by_condition are empty arrays (not null)
```

#### Error: Unauthenticated

```gherkin
Scenario: Get stats without auth
  When the client sends GET /collection/stats without an auth token
  Then a 401 response is returned
```

---

### Batch Check (GET /collection/check)

#### Happy Path: Mix of Owned and Not-Owned

```gherkin
Scenario: Check which items are in collection
  Given the user owns 2 copies of item A and 0 copies of item B
  When the client sends GET /collection/check?itemIds={A},{B}
  Then a 200 response is returned
  And items[A] has count: 2 and collection_ids with 2 UUIDs
  And items[B] has count: 0 and collection_ids: []
```

#### Happy Path: Trailing Comma Handled

```gherkin
Scenario: Trailing comma in itemIds is filtered
  When the client sends GET /collection/check?itemIds={uuid},
  Then a 200 response is returned
  And only the non-empty UUID is checked
```

#### Error: Too Many IDs

```gherkin
Scenario: More than 50 item IDs
  When the client sends GET /collection/check with 51 UUIDs
  Then a 400 response is returned
```

#### Error: Invalid UUID

```gherkin
Scenario: Non-UUID in itemIds
  When the client sends GET /collection/check?itemIds=not-a-uuid
  Then a 400 response is returned
```

#### Error: Empty itemIds

```gherkin
Scenario: Empty itemIds parameter
  When the client sends GET /collection/check?itemIds=
  Then a 400 response is returned
```

---

### Get Collection Item (GET /collection/:id)

#### Happy Path: Active Item

```gherkin
Scenario: Get active collection item
  When the client sends GET /collection/{id} for an active entry
  Then a 200 response is returned with the full item data
```

#### Error: Soft-Deleted Item

```gherkin
Scenario: Get soft-deleted collection item
  Given the collection item has been soft-deleted
  When the client sends GET /collection/{id}
  Then a 404 response is returned
```

#### Error: Non-Existent Item

```gherkin
Scenario: Get non-existent collection item
  When the client sends GET /collection/{non-existent-uuid}
  Then a 404 response is returned
```

#### Error: Invalid UUID

```gherkin
Scenario: Get with non-UUID id
  When the client sends GET /collection/not-a-uuid
  Then a 400 response is returned
```

#### RLS Isolation: Cross-User Access

```gherkin
Scenario: User B tries to access User A's collection item
  Given User A owns collection item {id}
  When User B sends GET /collection/{id}
  Then a 404 response is returned (not 403 — no information leakage)
```

---

### Update Collection Item (PATCH /collection/:id)

#### Happy Path: Update Condition

```gherkin
Scenario: Update only condition
  When the client sends PATCH /collection/{id} with { condition: "damaged" }
  Then a 200 response is returned with the updated condition
```

#### Happy Path: Update Notes

```gherkin
Scenario: Update only notes
  When the client sends PATCH /collection/{id} with { notes: "New notes" }
  Then a 200 response is returned with the updated notes
```

#### Happy Path: Clear Notes with Null

```gherkin
Scenario: Clear notes by setting null
  When the client sends PATCH /collection/{id} with { notes: null }
  Then a 200 response is returned with notes: null
```

#### Error: Empty Body

```gherkin
Scenario: PATCH with empty body
  When the client sends PATCH /collection/{id} with {}
  Then a 400 response is returned with "At least one field (condition, notes) is required"
```

#### Error: Soft-Deleted Item

```gherkin
Scenario: PATCH soft-deleted item
  Given the collection item has been soft-deleted
  When the client sends PATCH /collection/{id} with { condition: "damaged" }
  Then a 404 response is returned
```

#### Error: Non-Existent Item

```gherkin
Scenario: PATCH non-existent item
  When the client sends PATCH /collection/{non-existent-uuid}
  Then a 404 response is returned
```

---

### Soft-Delete (DELETE /collection/:id)

#### Happy Path: Soft-Delete

```gherkin
Scenario: Soft-delete a collection item
  When the client sends DELETE /collection/{id}
  Then a 204 response is returned
  And the item no longer appears in GET /collection
  And the item no longer appears in GET /collection/stats
  And the item no longer appears in GET /collection/check
```

#### Error: Non-Existent or Already Deleted

```gherkin
Scenario: Delete non-existent item
  When the client sends DELETE /collection/{non-existent-uuid}
  Then a 404 response is returned
```

---

### Restore (POST /collection/:id/restore)

#### Happy Path: Restore Soft-Deleted Item

```gherkin
Scenario: Restore a soft-deleted collection item
  Given the collection item has been soft-deleted
  When the client sends POST /collection/{id}/restore
  Then a 200 response is returned with the full item data
  And the item appears in GET /collection again
```

#### Happy Path: Idempotent on Active Item

```gherkin
Scenario: Restore an already-active item
  Given the collection item is active (not deleted)
  When the client sends POST /collection/{id}/restore
  Then a 200 response is returned with the current item data
```

#### Error: Non-Existent Item

```gherkin
Scenario: Restore non-existent item
  When the client sends POST /collection/{non-existent-uuid}/restore
  Then a 404 response is returned
```

#### RLS Isolation: Cross-User Restore

```gherkin
Scenario: User B tries to restore User A's item
  Given User A owns a soft-deleted collection item {id}
  When User B sends POST /collection/{id}/restore
  Then a 404 response is returned
```
