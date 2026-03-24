# E2E: Collection Export/Import

## Background

Given the web app is running
And a user with role "user" exists
And the user is signed in

## Scenarios

### Export

#### Happy Path: Export collection downloads JSON file with correct content

```gherkin
Scenario: User exports their populated collection
  Given the user has 2 items in their collection
  When they click the "Export" button in the toolbar
  Then a file download is triggered
  And the filename matches "collection-export-YYYY-MM-DD.json"
  And the downloaded JSON has version 1
  And the items array has 2 entries
  And a success toast shows "Collection exported"
```

#### Happy Path: Export toast shows item count

```gherkin
Scenario: Export success toast displays the number of items saved
  Given the user has 1 item in their collection
  When they click the "Export" button and the download completes
  Then a success toast shows "1 item saved to file"
```

#### Display: Export button is disabled on empty collection

```gherkin
Scenario: Export button is disabled when collection is empty
  Given the user has no items in their collection
  When they navigate to /collection
  Then the "Export" button is disabled
```

### Import — Empty State CTA

#### Display: Empty collection shows "Import from file" link

```gherkin
Scenario: Empty state displays import CTA
  Given the user has no items in their collection
  When they navigate to /collection
  Then an "or Import from file" button is visible below the "Browse Catalog" CTA
```

#### Happy Path: Empty state import CTA opens import dialog

```gherkin
Scenario: Clicking empty state import CTA opens the dialog
  Given the user has no items in their collection
  And they are on /collection
  When they click "or Import from file"
  Then the "Import Collection" dialog opens
  And the drop zone is visible with text "Drop your export file here"
```

### Import — Confirmation Dialogs

#### Happy Path: Append confirmation dialog shows correct item count

```gherkin
Scenario: User sees append confirmation with item count
  Given the user has items in their collection
  And the import dialog is open with a valid 2-item export file selected
  When they click "Append"
  Then an AlertDialog appears with title "Append to collection?"
  And the description mentions adding 2 items
  And there is an "Append 2 items" action button
```

#### Happy Path: Overwrite confirmation dialog for similar-sized import

```gherkin
Scenario: User sees standard overwrite confirmation
  Given the user has 5 items in their collection
  And the import dialog is open with a valid 5-item export file selected
  When they click "Replace"
  Then an AlertDialog appears with title "Replace entire collection?"
  And there is a "Replace collection" action button styled in red
```

#### Happy Path: Size warning dialog for much smaller import

```gherkin
Scenario: User sees extra warning when import is much smaller than collection
  Given the user has 10 items in their collection
  And the import dialog is open with a valid 4-item export file selected
  When they click "Replace"
  Then an AlertDialog appears with title "Import is much smaller than your collection"
  And the description mentions 10 existing items and 4 import items
  And there is a "Yes, replace collection" action button styled in red
```

### Import — Happy Paths

#### Happy Path: Append import shows all-success manifest

```gherkin
Scenario: User appends items and sees success result
  Given the user has items in their collection
  And the import dialog is open with a valid export file containing known slugs
  When they click "Append" and confirm in the AlertDialog
  Then the dialog title changes to "Import Complete"
  And the all-success manifest shows "All items imported"
  And the imported count matches the file's item count
  And a "Done" button is visible
```

#### Happy Path: Overwrite import shows overwritten count

```gherkin
Scenario: User overwrites collection and sees overwritten count
  Given the user has 3 items in their collection
  And the import dialog is open with a valid 2-item export file containing known slugs
  When they click "Replace" and confirm in the AlertDialog
  Then the dialog title changes to "Import Complete"
  And the manifest shows "3 previous items were archived"
  And the imported count is 2
```

#### Happy Path: Clicking Done closes the import dialog

```gherkin
Scenario: Done button closes the import dialog after successful import
  Given an import has completed successfully
  And the success manifest is displayed
  When they click "Done"
  Then the import dialog closes
```

### Import — Error States

#### Error: Invalid JSON file shows error alert

```gherkin
Scenario: User selects a file that is not valid JSON
  Given the import dialog is open
  When they select a file containing "not valid json{{"
  Then an error alert appears with title "Invalid file format"
  And a "Choose a different file" link is shown
```

#### Error: Valid JSON but invalid export schema shows error alert

```gherkin
Scenario: User selects a JSON file that doesn't match the export schema
  Given the import dialog is open
  When they select a file containing valid JSON that fails schema validation
  Then an error alert appears with title "Invalid file format"
  And a "Choose a different file" link is shown
```

#### Error: Unsupported schema version shows error alert

```gherkin
Scenario: User selects a file with a future schema version
  Given the import dialog is open
  When they select a valid export file with version 999
  Then an error alert appears with title "Unsupported schema version"
  And the message mentions "schema v999"
```

#### Error: Empty items array shows warning alert

```gherkin
Scenario: User selects a file with zero items
  Given the import dialog is open
  When they select a valid export file with an empty items array
  Then a warning alert appears with title "No items to import"
  And the alert uses amber/warning styling (not red/error)
```

#### Error: API failure shows error alert with retry

```gherkin
Scenario: Import API returns a server error
  Given the import dialog is open with a valid file selected
  And the import API will return a 500 error
  When they click "Append" and confirm
  Then an error alert appears with title "Import failed"
  And a "Try again" link is shown (not "Choose a different file")
```

### Import — Partial Success & Retry

#### Happy Path: Partial success shows imported and unresolved sections

```gherkin
Scenario: Import resolves some items but not others
  Given the import dialog is open with a file containing 1 known slug and 1 unknown slug
  When they click "Append" and confirm
  Then the dialog title changes to "Import Complete"
  And the manifest shows "1" imported and "1" unresolved
  And the unresolved section shows the unknown slug with reason "Item not found in catalog"
  And the imported section shows the resolved item name
```

#### Happy Path: Download failed items creates retry file

```gherkin
Scenario: User downloads a retry file for unresolved items
  Given a partial-success import has completed
  And the manifest shows unresolved items
  When they click "Download failed items"
  Then a file download is triggered
  And the filename matches "collection-import-retry-YYYY-MM-DD.json"
  And the downloaded JSON contains only the unresolved items
  And the version is 1
```
