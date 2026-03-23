# E2E: Collection Management

## Background

Given the web app is running
And a user with role "user" exists
And the user is signed in

## Scenarios

### Empty State

#### Display: Empty collection page shows CTA

```gherkin
Scenario: User with no collection items sees empty state
  Given the user has no items in their collection
  When they navigate to /collection
  Then a heading "My Collection" is displayed
  And the text "Your collection is empty" is shown
  And a "Browse Catalog" button links to /catalog
```

#### Display: Dashboard shows empty collection CTA

```gherkin
Scenario: Dashboard displays empty collection state
  Given the user has no items in their collection
  When they navigate to /
  Then the text "Start building your collection" is shown
  And a "Browse Catalog" button links to /catalog
```

### Dashboard Stats

#### Happy Path: Dashboard shows collection stats cards

```gherkin
Scenario: Dashboard displays populated collection stats
  Given the user has 5 copies of 4 unique items across 2 franchises
  And 2 items are in mint_sealed condition
  When they navigate to /
  Then a "Your Collection" heading is shown
  And a stats card shows "5" copies
  And a stats card shows "4" unique items
  And a stats card shows "2" franchises
  And a stats card shows "2" mint sealed
  And a "View All" button links to /collection
```

### Add to Collection

#### Happy Path: Add item from catalog detail page

```gherkin
Scenario: User adds an item to their collection from the catalog
  Given the user is on a catalog item detail page
  And the item is not in their collection
  And an "Add to Collection" button is visible
  When they click "Add to Collection"
  Then an "Add to Collection" dialog opens
  And the condition defaults to "Unknown"
  When they click a condition option (e.g., "Loose Complete")
  And click the "Add to Collection" submit button
  Then a success toast shows "<item name> added to your collection"
  And the button changes to show "In collection (1)" with "Add Copy" label
```

#### Happy Path: Add multiple copies of the same item

```gherkin
Scenario: User adds a second copy of an item already in their collection
  Given the user has one copy of an item in their collection
  And the item detail page shows "In collection (1)" and "Add Copy"
  When they click "Add Copy"
  And complete the add dialog
  Then a success toast confirms the addition
  And the button updates to show "In collection (2)"
```

### Collection Page Display

#### Happy Path: Collection page shows stats bar and items

```gherkin
Scenario: User views their populated collection
  Given the user has items in their collection
  When they navigate to /collection
  Then the stats bar shows total copies and unique items
  And franchise pill buttons are displayed
  And collection item cards are visible in the grid
  And each card shows the item name and condition badge
```

### Filtering

#### Happy Path: Filter by franchise and condition

```gherkin
Scenario: User filters collection by franchise pill and condition dropdown
  Given the user is on /collection with items from multiple franchises
  When they click a franchise pill (e.g., "Transformers")
  Then the URL updates to include franchise=transformers
  When they select a condition from the "Filter by condition" dropdown
  Then the URL updates to include the condition parameter
```

#### Happy Path: Debounced search filters collection

```gherkin
Scenario: User searches their collection by text
  Given the user is on /collection
  When they type "bulkhead" in the search input
  And wait for the 300ms debounce
  Then the URL updates to include search=bulkhead
```

### Edit and Remove

#### Happy Path: Edit collection item condition and notes

```gherkin
Scenario: User edits a collection item's condition
  Given the user is on /collection with at least one item
  When they click the edit button (pencil icon) on an item card
  Then the "Edit Collection Entry" dialog opens
  And the current condition is pre-selected
  When they select a different condition (e.g., "Opened Complete")
  And click "Save Changes"
  Then a success toast shows "Collection entry updated"
  And the dialog closes
```

#### Happy Path: Remove item with undo restore

```gherkin
Scenario: User removes an item and restores it via undo
  Given the user is on /collection with at least one item
  When they click the edit button on an item card
  And click the "Remove" button in the dialog
  Then the dialog closes
  And a toast shows "Removed from collection" with the item name
  And the toast has an "Undo" action button
  When they click the "Undo" button in the toast
  Then a success toast shows "Restored to collection"
```

### View Toggle

#### Happy Path: Switch between grid and table views

```gherkin
Scenario: User toggles between grid and table view
  Given the user is on /collection in the default grid view
  When they click the "Table view" radio button
  Then the collection displays as a table with column headers
  When they navigate away and return to /collection
  Then the table view persists (localStorage preference)
```

### Navigation

#### Display: MainNav active state on collection page

```gherkin
Scenario: My Collection nav link is active on /collection
  Given the user is on /collection
  Then the "My Collection" navigation link has aria-current="page"
```
