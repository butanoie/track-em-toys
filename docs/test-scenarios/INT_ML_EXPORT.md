# INT: ML Training Data Export

## Background

Given the API server is running
And the database has catalog items with approved photos
And the photo storage directory exists with photo files

## Scenarios

### Happy Path: Admin exports items matching search

```gherkin
Scenario: Admin triggers ML export with search query
  Given the user is authenticated as an admin
  And items matching "optimus" exist with approved photos
  When they POST /catalog/ml-export?q=optimus
  Then the response status is 200
  And the response contains exported_at, filename, and stats
  And a manifest JSON file is written to ML_EXPORT_PATH
  And the manifest contains entries mapping photo paths to item labels
  And each label is formatted as "{franchise_slug}/{item_slug}"
  And each photo_path is an absolute path to the original WebP file
```

### Happy Path: Export with franchise filter

```gherkin
Scenario: Admin exports items filtered to a specific franchise
  Given the user is authenticated as an admin
  And items exist in both "transformers" and "gi-joe" franchises
  When they POST /catalog/ml-export?q=warrior&franchise=transformers
  Then the manifest only contains items from the "transformers" franchise
```

### Happy Path: Low photo count warnings

```gherkin
Scenario: Items with few photos produce warnings
  Given the user is authenticated as an admin
  And an item "optimus-prime-voyager" has 3 approved photos
  When they POST /catalog/ml-export?q=optimus
  Then the response stats.low_photo_items is 1
  And the response warnings array contains an entry for "transformers/optimus-prime-voyager"
  And the warning includes the photo_count of 3
  But the item's photos are still included in the manifest entries
```

### Happy Path: Empty result set

```gherkin
Scenario: No items match the search query
  Given the user is authenticated as an admin
  When they POST /catalog/ml-export?q=nonexistent
  Then the response status is 200
  And stats.total_photos is 0
  And stats.items is 0
  And the manifest file is still written (with empty entries)
```

### Happy Path: Items with no approved photos

```gherkin
Scenario: Matching items without approved photos are excluded from manifest
  Given the user is authenticated as an admin
  And an item "megatron-leader" exists but has no approved photos
  When they POST /catalog/ml-export?q=megatron
  Then the manifest entries do not contain "megatron-leader"
  And stats.items does not count items with zero photos
```

### Guard: Authentication required

```gherkin
Scenario: Unauthenticated request is rejected
  Given the user is not authenticated
  When they POST /catalog/ml-export?q=optimus
  Then the response status is 401
```

### Guard: Admin role required

```gherkin
Scenario: Curator role is insufficient
  Given the user is authenticated as a curator
  When they POST /catalog/ml-export?q=optimus
  Then the response status is 403
```

```gherkin
Scenario: Regular user role is insufficient
  Given the user is authenticated as a regular user
  When they POST /catalog/ml-export?q=optimus
  Then the response status is 403
```

### Validation: Missing search query

```gherkin
Scenario: Request without search query is rejected
  Given the user is authenticated as an admin
  When they POST /catalog/ml-export (no query params)
  Then the response status is 400
```

### Error: Filesystem write failure

```gherkin
Scenario: Export fails when ML_EXPORT_PATH is not writable
  Given the user is authenticated as an admin
  And ML_EXPORT_PATH points to a non-writable directory
  When they POST /catalog/ml-export?q=optimus
  Then the response status is 500
  And the error message indicates a write failure
```

### Idempotency: Timestamped filenames

```gherkin
Scenario: Each export creates a uniquely named file
  Given the user is authenticated as an admin
  When they POST /catalog/ml-export?q=optimus twice
  Then two distinct manifest files are created
  And each filename follows the ISO8601 format (e.g., 20260321T154530Z.json)
```
