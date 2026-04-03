# INT: Collection Item Photos API

## Background

Given the API server is running
And the database has an item "optimus-prime" in franchise "transformers"
And user A has a collection item for "optimus-prime"
And user B has a separate collection item for "optimus-prime"

## Scenarios

### Upload

```gherkin
Scenario: User uploads a single photo to their collection item
  Given user A is authenticated
  When they POST a multipart request with one JPEG file to /collection/{itemId}/photos
  Then the response status is 201
  And the response body contains a photos array with 1 entry
  And the photo has a relative URL under collection/{userId}/{collectionItemId}/
  And two files exist on disk: thumb and original (both WebP)

Scenario: User uploads multiple photos in one request
  Given user A is authenticated
  When they POST a multipart request with 3 image files
  Then the response status is 201
  And the response body contains a photos array with 3 entries
  And each photo has a sequential sort_order

Scenario: Upload rejected without authentication
  Given no Authorization header is provided
  When they POST a multipart upload
  Then the response status is 401

Scenario: Upload rejected for non-existent collection item
  Given user A is authenticated
  When they POST to /collection/{nonexistent-id}/photos
  Then the response status is 404

Scenario: Upload rejected for another user's collection item (RLS)
  Given user A is authenticated
  When they POST a photo to user B's collection item
  Then the response status is 404
  And no files are written to disk

Scenario: Upload rejected for invalid image format
  Given user A is authenticated
  When they POST a file with mimetype "text/plain"
  Then the response status is 400

Scenario: Upload rejected for SVG (XSS risk)
  Given user A is authenticated
  When they POST a file with mimetype "image/svg+xml"
  Then the response status is 400

Scenario: Upload rejected when image dimensions are too small
  Given user A is authenticated
  When they POST an image smaller than 600px on shortest edge
  Then the response status is 400
  And the error mentions minimum dimension

Scenario: Upload detects duplicate within same collection item
  Given user A has a photo on their collection item
  When they upload a perceptually similar photo (dHash distance <= 10)
  Then the response status is 409
  And the response includes the matched photo id and url

Scenario: Upload succeeds for same photo on different collection items
  Given user A has a photo on collection item 1
  When they upload the same photo to collection item 2
  Then the response status is 201
  And deduplication only checks within the target collection item
```

### List

```gherkin
Scenario: User lists photos for their collection item
  Given user A has 3 photos on their collection item
  When they GET /collection/{itemId}/photos
  Then the response status is 200
  And the response contains 3 photos ordered by is_primary DESC, sort_order ASC

Scenario: User cannot list photos for another user's collection item (RLS)
  Given user B has photos on their collection item
  When user A sends GET /collection/{userB-itemId}/photos
  Then the response status is 404

Scenario: List returns empty array for item with no photos
  Given user A's collection item has no photos
  When they GET /collection/{itemId}/photos
  Then the response status is 200
  And the response contains an empty photos array
```

### Delete

```gherkin
Scenario: User deletes their own photo
  Given user A has a photo on their collection item
  When they send DELETE /collection/{itemId}/photos/{photoId}
  Then the response status is 204
  And the photo row is removed from the database
  And the photo files are removed from disk

Scenario: Delete returns 404 for non-existent photo
  Given no photo with that id exists for the collection item
  When the user sends DELETE
  Then the response status is 404

Scenario: User cannot delete another user's photo (RLS)
  Given user B has a photo on their collection item
  When user A sends DELETE for that photo
  Then the response status is 404
  And the photo files remain on disk

Scenario: Deleting a contributed photo does not delete the catalog copy
  Given user A has contributed a photo to the catalog
  When user A deletes the original collection photo
  Then the response status is 204
  And the collection photo files are removed
  But the catalog photo files remain intact
  And the photo_contributions row is preserved
```

### Set Primary

```gherkin
Scenario: User sets a photo as primary
  Given user A has 2 photos, photo-1 is primary
  When they PATCH /collection/{itemId}/photos/{photo-2}/primary
  Then the response status is 200
  And photo-2 is now primary
  And photo-1 is no longer primary

Scenario: Setting primary on already-primary photo is idempotent
  Given photo-1 is already primary
  When they PATCH to set photo-1 as primary
  Then the response status is 200
  And photo-1 remains primary
```

### Reorder

```gherkin
Scenario: User reorders photos
  Given user A has 3 photos [a, b, c]
  When they PATCH /collection/{itemId}/photos/reorder with [c, a, b]
  Then the response status is 200
  And the photos are returned in the new order
  And each photo has the updated sort_order
```

### Contribute to Catalog

```gherkin
Scenario: User contributes a photo to the catalog
  Given user A has a photo on their collection item
  And the collection item references catalog item "optimus-prime"
  When they POST /collection/{itemId}/photos/{photoId}/contribute
  With body { "consent_version": "1.0", "consent_acknowledged": true }
  Then the response status is 201
  And a photo_contributions row is created with status "pending"
  And an item_photos row is created with status "pending" and uploaded_by = user A
  And the photo files are copied to the catalog directory {catalogItemId}/{newPhotoId}-*.webp
  And the contribution row has file_copied = true

Scenario: Contribution rejected without consent acknowledgement
  Given user A has a photo
  When they POST contribute with consent_acknowledged = false
  Then the response status is 400

Scenario: Contribution rejected for already-contributed photo
  Given user A already contributed this photo (status != 'revoked')
  When they POST contribute again
  Then the response status is 409

Scenario: Contribution rejected for another user's photo (RLS)
  Given user B has a photo
  When user A attempts to contribute user B's photo
  Then the response status is 404

Scenario: User revokes their contribution
  Given user A contributed a photo (status = 'pending' or 'approved')
  When they DELETE /collection/{itemId}/photos/{photoId}/contribution
  Then the response status is 200
  And the contribution status is set to 'revoked'
  And the catalog item_photos row is NOT deleted (curator manages catalog)
```

### GDPR Purge

```gherkin
Scenario: GDPR purge deletes all collection photos and collection items
  Given user A has 5 collection photos across 3 collection items
  When an admin runs GDPR purge for user A
  Then all collection_item_photos rows for user A are deleted
  And all collection_items rows for user A are deleted
  And all files under collection/{userA-id}/ are removed from disk

Scenario: GDPR purge preserves contribution audit records
  Given user A has 2 contributions (one pending, one approved)
  When an admin runs GDPR purge for user A
  Then the photo_contributions rows are preserved
  And their collection_item_photo_id is NULL (source photo deleted via ON DELETE SET NULL)
  And their contributed_by still references the tombstone user row
  And their item_photo_id still references the surviving catalog photo
  And their consent_version is preserved

Scenario: GDPR purge anonymizes contributed catalog photos
  Given user A contributed 2 photos that were approved in the catalog
  When an admin runs GDPR purge for user A
  Then the item_photos rows have uploaded_by = NULL
  But the catalog photo files remain intact
  And the photos are still visible in the catalog

Scenario: GDPR purge uses RLS context switch for FORCE RLS tables
  Given user A has collection items and photos
  When an admin runs GDPR purge for user A
  Then the purge switches app.user_id to the target user for RLS-protected deletes
  And subsequent non-RLS operations (item_photos, photo_contributions) succeed
```

### Collection List Integration

```gherkin
Scenario: Collection list includes photo metadata
  Given user A has a collection item with 3 photos (one primary)
  When they GET /collection
  Then each collection item in the response includes collection_photo_url and collection_photo_count
  And collection_photo_url is the primary photo's thumbnail URL
  And collection_photo_count is 3

Scenario: Collection item with no photos returns null photo URL
  Given user A has a collection item with no photos
  When they GET /collection
  Then the item has collection_photo_url = null and collection_photo_count = 0
```
