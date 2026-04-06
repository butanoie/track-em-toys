# E2E: Collection Item Photos

## Background

Given the web app is running
And the user is signed in
And the user has at least one item in their collection

## Scenarios

### Photo Upload

```gherkin
Scenario: User uploads a photo to their collection item
  Given the user is on the collection page
  When they click the camera icon on a collection item
  Then the "Manage Photos" sheet opens on the right
  When they drop a JPEG file into the drop zone
  Then a progress bar appears showing upload status
  And after upload completes, the photo appears in the grid
  And a success notification is shown

Scenario: User uploads multiple photos
  Given the photo management sheet is open
  When they select 3 files via the file picker
  Then the upload queue shows 3 items
  And files are uploaded sequentially with individual progress
  And each photo appears in the grid after its upload completes

Scenario: Upload shows error for invalid file type
  Given the photo management sheet is open
  When they drop a PDF file into the drop zone
  Then an error toast appears mentioning supported formats
  And no upload is initiated
```

### Photo Management

```gherkin
Scenario: User sets a photo as primary
  Given the collection item has 2 photos
  And the photo management sheet is open
  When they click the star icon on the non-primary photo
  Then that photo shows the filled star (primary badge)
  And the previously primary photo shows an empty star

Scenario: User reorders photos by drag and drop
  Given the collection item has 3 photos
  And the photo management sheet is open
  When they drag the third photo to the first position
  Then the photos reorder visually
  And the new order persists after closing and reopening the sheet

Scenario: User deletes a photo
  Given the collection item has a photo
  And the photo management sheet is open
  When they click the delete (trash) icon on a photo
  Then a confirmation dialog appears with "Delete photo?"
  When they confirm the deletion
  Then the photo is removed from the grid
  And a success toast confirms the deletion
```

### Photo Display in Collection Views

```gherkin
Scenario: Collection grid shows primary collection photo
  Given the user has uploaded a photo to a collection item
  When they view the collection page in grid mode
  Then the collection item card shows the user's photo as the thumbnail
  And it does NOT show the catalog reference photo

Scenario: Collection grid falls back to catalog photo
  Given the user has NOT uploaded any photos to a collection item
  When they view the collection page in grid mode
  Then the collection item card shows the catalog reference photo thumbnail

Scenario: Camera button shows photo count badge
  Given a collection item has 3 photos
  When the user views the collection page
  Then the camera button on that item shows a "3" badge

Scenario: Collection table shows thumbnail column
  Given the user is viewing the collection in table mode
  Then each row shows a small thumbnail (collection photo or catalog fallback)
  And each row has a camera icon button in the actions column
```

### Contribute to Catalog

```gherkin
Scenario: User contributes a photo to the catalog
  Given the photo management sheet is open
  And the user has uploaded a photo
  When they click the contribute (share) icon on a photo
  Then the "Contribute Photo to Catalog" dialog appears
  And it shows a photo preview
  And it shows licensing disclaimer text
  And the "Contribute to Catalog" button is disabled

  When they check "I confirm I have the right to share this photo"
  Then the "Contribute to Catalog" button becomes enabled

  When they click "Contribute to Catalog"
  Then a success toast says "Photo contributed for review"
  And the dialog closes
  And the photo tile shows a "Submitted" badge (amber)
  And the contribute icon is no longer visible on that photo

Scenario: Contributed badge persists after sheet reopen
  Given a photo has been contributed
  When the user closes and reopens the photo management sheet
  Then the contributed photo still shows the "Submitted" badge

Scenario: User cannot contribute the same photo twice
  Given a photo already has a "Submitted" badge
  Then there is no contribute action available on that photo tile

Scenario: Approved contribution shows "Shared" badge
  Given a photo's contribution has been approved by a curator
  When the user views the photo management sheet
  Then the photo tile shows a "Shared" badge (green)
  And there is no contribute action available on that photo tile

Scenario: Rejected contribution allows re-contribution
  Given a photo's contribution was rejected by a curator
  When the user views the photo management sheet
  Then the contribute icon is visible on that photo (no badge)
  And the user can click contribute to submit again
```

### Add-by-Photo Integration

```gherkin
Scenario: Add-by-Photo shows photo save checkboxes
  Given the user is on the collection page
  When they click "Add by Photo"
  And upload a toy photo for ML identification
  And the model returns predictions
  When they click "Add" on a prediction card
  Then the "Add to Collection" dialog shows the standard fields (condition, notes)
  And below those, a "Photo Options" section appears
  And it shows a thumbnail preview of the scanned photo
  And "Save this photo to your collection item" is checked by default
  And "Contribute this photo to the catalog" is unchecked by default

Scenario: User adds item with photo saved
  Given the Add to Collection dialog is open from Add-by-Photo
  And "Save this photo to your collection item" is checked
  And "Contribute this photo to the catalog" is unchecked
  When they click "Add to Collection"
  Then the collection item is created
  And the scanned photo is uploaded to the new collection item
  And a success toast confirms the addition

Scenario: User adds item with photo saved and contributed
  Given the Add to Collection dialog is open from Add-by-Photo
  And "Save this photo to your collection item" is checked
  When they check "Contribute this photo to the catalog"
  Then condensed disclaimer text expands below the checkbox
  When they click "Add to Collection"
  Then the collection item is created
  And the scanned photo is uploaded to the new collection item
  And the photo is contributed to the catalog (pending approval)
  And a success toast confirms the addition

Scenario: User adds item without saving photo
  Given the Add to Collection dialog is open from Add-by-Photo
  When they uncheck "Save this photo to your collection item"
  Then the "Contribute" checkbox becomes hidden (no photo to contribute)
  When they click "Add to Collection"
  Then the collection item is created without any photo

Scenario: Standard Add to Collection dialog has no photo options
  Given the user opens "Add to Collection" from a catalog item page (not Add-by-Photo)
  Then the dialog shows condition, condition grade, and notes fields
  But there are no "Photo Options" checkboxes
```
