# E2E: Catalog Browse by Manufacturer

## Background

Given the user is logged in
And the catalog database is seeded with test data
And API responses are mocked via `page.route()`

## Scenarios

### Manufacturer List Page

#### Scenario: View manufacturer list in grid mode

```gherkin
Scenario: Manufacturer list displays in grid view by default
  When the user navigates to /catalog/manufacturers
  Then the manufacturer list page is displayed
  And manufacturers are shown as tile cards with name and item count
  And the grid/table toggle is visible with grid selected
```

#### Scenario: Toggle to table view

```gherkin
Scenario: Switch to table view
  Given the user is on the manufacturer list page
  When the user clicks the table view toggle
  Then manufacturers are shown in a table with Name, Items, Toy Lines, Franchises columns
  And the view preference is persisted to localStorage
```

#### Scenario: Navigate to manufacturer hub

```gherkin
Scenario: Click a manufacturer tile navigates to hub page
  Given the user is on the manufacturer list page
  When the user clicks the "Hasbro" manufacturer tile
  Then the user is navigated to /catalog/manufacturers/hasbro
```

### Manufacturer Hub Page

#### Scenario: View manufacturer detail with metadata

```gherkin
Scenario: Manufacturer hub shows metadata and franchise cards
  When the user navigates to /catalog/manufacturers/hasbro
  Then the page shows "Hasbro" as the manufacturer name
  And the breadcrumb shows Catalog > Manufacturers > Hasbro
  And manufacturer metadata is displayed (country, licensee status)
  And franchise cards are shown with item counts
  And toy line cards are shown with item counts
  And a "Browse All Items" CTA button is visible
```

#### Scenario: Navigate to manufacturer items from hub

```gherkin
Scenario: Browse All Items CTA navigates to items page
  Given the user is on the Hasbro hub page
  When the user clicks "Browse All Items"
  Then the user is navigated to /catalog/manufacturers/hasbro/items
```

#### Scenario: Manufacturer not found

```gherkin
Scenario: Invalid manufacturer slug shows 404 state
  When the user navigates to /catalog/manufacturers/nonexistent
  Then a "Manufacturer not found" message is displayed
  And a link to the manufacturer list is shown
```

### Manufacturer Items Page

#### Scenario: Browse manufacturer items with three-column layout

```gherkin
Scenario: Items page shows faceted three-column layout
  When the user navigates to /catalog/manufacturers/hasbro/items
  Then the facet sidebar is visible on desktop with franchise, toy line, size class, continuity, and type filters
  And the item list shows items with total count
  And the detail panel placeholder is visible
```

#### Scenario: Select an item to view detail

```gherkin
Scenario: Clicking an item opens the detail panel
  Given the user is on the Hasbro items page
  When the user clicks an item in the list
  Then the item detail panel shows the item's full information
  And the selected item slug appears in the URL search params
```

#### Scenario: Filter items by franchise

```gherkin
Scenario: Franchise facet filters items
  Given the user is on the Hasbro items page
  When the user selects "Transformers" in the franchise facet
  Then the URL updates with ?franchise=transformers
  And the item list shows only Transformers items by Hasbro
  And an active filter chip for "franchise: transformers" appears
```

#### Scenario: Clear all filters

```gherkin
Scenario: Clear all resets to unfiltered state
  Given the user has active filters on the manufacturer items page
  When the user clicks "Clear all"
  Then all filter params are removed from the URL
  And the item list shows all items for the manufacturer
```

#### Scenario: Pagination navigation

```gherkin
Scenario: Next and Previous page navigation
  Given items exceed the page size
  When the user clicks "Next"
  Then the next page of items is displayed
  And the "Previous" button becomes enabled
  When the user clicks "Previous"
  Then the previous page is restored
```

### Cross-Page Navigation

#### Scenario: FranchiseListPage links to manufacturer browsing

```gherkin
Scenario: Catalog page has a link to manufacturer browsing
  When the user navigates to /catalog
  Then a "Browse by Manufacturer" link is visible
  When the user clicks the link
  Then the user is navigated to /catalog/manufacturers
```

#### Scenario: ManufacturerListPage breadcrumb navigates back

```gherkin
Scenario: Breadcrumb navigates back to catalog
  Given the user is on /catalog/manufacturers
  When the user clicks "Catalog" in the breadcrumb
  Then the user is navigated to /catalog
```
