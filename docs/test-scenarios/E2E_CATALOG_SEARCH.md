# E2E: Catalog Search

## Background

Given the user is authenticated
And the catalog contains characters and items across multiple franchises

## Scenarios

### Happy Path: Search from AppHeader

```gherkin
Scenario: User searches from the header search input
  Given the user is on any authenticated page
  When they type "optimus" in the header search input
  And the 300ms debounce fires
  Then the browser navigates to /catalog/search?q=optimus
  And the search results page displays
```

### Happy Path: Grouped results display

```gherkin
Scenario: Search results are grouped by entity type
  Given the user is on /catalog/search?q=optimus
  When search results load
  Then character results are displayed under a "Characters" heading with count
  And item results are displayed under an "Items" heading with count
  And item results show manufacturer, toy line, and size class
```

### Happy Path: Item detail panel opens

```gherkin
Scenario: User selects an item search result
  Given the user is on the search results page with item results
  When they click an item result
  Then the item detail panel opens on the right
  And the detail panel shows full item information
  And the URL updates with selected and selected_type params
```

### Happy Path: Character detail panel opens

```gherkin
Scenario: User selects a character search result
  Given the user is on the search results page with character results
  When they click a character result
  Then the character detail panel opens showing full character information
  And the panel shows faction, continuity family, and character type
  And a "View full profile" link is available
```

### Happy Path: Page-number pagination

```gherkin
Scenario: User navigates between pages of search results
  Given the user has searched with results spanning multiple pages
  When they click page 2
  Then the URL updates to page=2
  And the results update to show page 2
  And the selected item is cleared
```

### Empty State: No query

```gherkin
Scenario: Search page with no query shows prompt
  Given the user navigates to /catalog/search without a q param
  Then the page displays "Search for characters and items across the catalog"
  And no results are shown
```

### Empty State: No results

```gherkin
Scenario: Search with no matching results
  Given the user searches for "zzzznonexistent"
  When the search completes with zero results
  Then the page displays "No results for 'zzzznonexistent'"
```

### Edge Case: Empty section hidden

```gherkin
Scenario: Entity type section hidden when no results of that type
  Given the user searches for a term matching only items (no characters)
  When results load
  Then the Characters section is not displayed
  And the Items section displays with results
```

### Keyboard: Arrow navigation in results

```gherkin
Scenario: User navigates search results with keyboard
  Given the user is on the search results page with results
  When they press ArrowDown
  Then the next item in the list is selected
  When they press Escape
  Then the detail panel closes
```

### Navigation: Browser back preserves search

```gherkin
Scenario: Browser back returns to search results
  Given the user searched for "optimus" and is viewing results
  When they navigate to another page
  And press the browser back button
  Then the search page loads with q=optimus
  And the search input shows "optimus"
```
