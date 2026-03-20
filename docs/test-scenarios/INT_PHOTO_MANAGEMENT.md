# INT: Photo Management API

## Background

Given the API server is running
And the database has an item "optimus-prime" in franchise "transformers"
And the test user has curator role

## Scenarios

### Upload

```gherkin
Scenario: Curator uploads a single photo
  Given the curator is authenticated
  When they POST a multipart request with one JPEG file to /catalog/franchises/transformers/items/optimus-prime/photos
  Then the response status is 201
  And the response body contains a photos array with 1 entry
  And the photo has a relative URL path ending in .webp
  And the photo has status "approved"
  And three files exist on disk: thumb, gallery, original

Scenario: Curator uploads multiple photos
  Given the curator is authenticated
  When they POST a multipart request with 3 image files
  Then the response status is 201
  And the response body contains a photos array with 3 entries
  And each photo has a sequential sort_order

Scenario: Upload rejected for non-curator user
  Given the user has role "user" (not curator)
  When they POST a multipart upload
  Then the response status is 403

Scenario: Upload rejected without authentication
  Given no Authorization header is provided
  When they POST a multipart upload
  Then the response status is 401

Scenario: Upload rejected for non-existent item
  Given the curator is authenticated
  When they POST to /catalog/franchises/transformers/items/nonexistent/photos
  Then the response status is 404

Scenario: Upload rejected for invalid image format
  Given the curator is authenticated
  When they POST a file with mimetype "text/plain"
  Then the response status is 400

Scenario: Upload rejected for SVG (XSS risk)
  Given the curator is authenticated
  When they POST a file with mimetype "image/svg+xml"
  Then the response status is 400

Scenario: Upload rejected when file exceeds size limit
  Given the curator is authenticated
  When they POST a file larger than PHOTO_MAX_SIZE_MB
  Then the response status is 413
```

### Delete

```gherkin
Scenario: Curator deletes a photo
  Given the item has a photo with id "photo-1"
  When the curator sends DELETE /catalog/franchises/transformers/items/optimus-prime/photos/photo-1
  Then the response status is 204
  And the photo row is removed from the database
  And the photo files are removed from disk

Scenario: Delete returns 404 for non-existent photo
  Given no photo with id "nonexistent" exists
  When the curator sends DELETE for that photo
  Then the response status is 404
```

### Set Primary

```gherkin
Scenario: Curator sets a photo as primary
  Given the item has photos "photo-1" (primary) and "photo-2"
  When the curator sends PATCH /catalog/franchises/transformers/items/optimus-prime/photos/photo-2/primary
  Then the response status is 200
  And photo-2 has is_primary = true
  And photo-1 has is_primary = false

Scenario: Set primary returns 404 for non-existent photo
  When the curator sends PATCH for a nonexistent photoId
  Then the response status is 404
```

### Reorder

```gherkin
Scenario: Curator reorders photos
  Given the item has 3 photos with sort_order [1, 2, 3]
  When the curator sends PATCH /reorder with body { photos: [{ id: "p3", sort_order: 1 }, { id: "p1", sort_order: 2 }, { id: "p2", sort_order: 3 }] }
  Then the response status is 200
  And the returned photos array reflects the new order

Scenario: Reorder returns 404 for non-existent item
  When the curator sends PATCH /reorder for a nonexistent item slug
  Then the response status is 404
```
