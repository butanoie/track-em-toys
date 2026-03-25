# E2E: Catalog Detail Pages

## Background

Given the user is authenticated
And the catalog contains franchises, characters, and items with photos

## Character Detail Page

### Happy Path: Navigate to character detail

```gherkin
Scenario: User navigates to a character detail page
  Given the user is on the franchise hub page
  When they navigate to /catalog/transformers/characters/optimus-prime
  Then the character detail page displays
  And the breadcrumb shows "Catalog > Transformers > Optimus Prime"
  And the page shows character name, faction, continuity family, character type, and alt-mode
```

### Happy Path: Character with combiner info

```gherkin
Scenario: Character detail shows combiner information
  Given the character has combined_form set (e.g., a component of Devastator)
  When the character detail page loads
  Then the combiner role is displayed
  And the combined form name is a link to the combined form's character page
```

### Happy Path: Combined form shows component characters

```gherkin
Scenario: Combined form character shows its component characters
  Given the character is a combined form (e.g., Devastator)
  And other characters have combined_form_id pointing to this character
  When the character detail page loads
  Then a "Component Characters" list is displayed
  And each component shows its name, combiner role, and alt-mode
  And each component name is a link to that character's detail page
```

### Happy Path: Combined form with no components

```gherkin
Scenario: Combined form badge shows when no component characters exist
  Given the character is a combined form but has no linked components
  When the character detail page loads
  Then the "Combined Form" badge is displayed
  And no component characters list is shown
```

### Happy Path: Character with sub-groups

```gherkin
Scenario: Character detail shows sub-groups
  Given the character belongs to one or more sub-groups
  When the character detail page loads
  Then sub-groups are listed
```

### Happy Path: Character with no sub-groups

```gherkin
Scenario: Sub-groups section hidden when empty
  Given the character belongs to no sub-groups
  When the character detail page loads
  Then the sub-groups section is not displayed
```

### Happy Path: Character appearances table

```gherkin
Scenario: Character detail shows appearances table
  Given the character has one or more appearances
  When the character detail page loads
  Then an appearances table displays with Name, Source, and Years columns
  And each row shows the appearance name, source media, and year range
```

### Happy Path: Character with no appearances

```gherkin
Scenario: Appearances section shows placeholder when empty
  Given the character has no appearances
  When the character detail page loads
  Then the appearances section displays "None recorded"
```

### Happy Path: Related items section

```gherkin
Scenario: Character detail shows related items
  Given items exist for this character in the catalog
  When the character detail page loads
  Then a "Related Items" section shows up to 10 items
  And each item name links to the item detail page
  And a "Browse all items" link navigates to /catalog/:franchise/items?character=:slug
```

### Error: Character not found

```gherkin
Scenario: 404 when character slug is invalid
  Given the user navigates to /catalog/transformers/characters/nonexistent
  When the API returns 404
  Then a "Character not found" message displays
  And a "Back to Catalog" link is available
```

## Item Detail Page

### Happy Path: Navigate to item detail

```gherkin
Scenario: User navigates to an item detail page
  Given the user is on the items browse page
  When they navigate to /catalog/transformers/items/legacy-bulkhead
  Then the item detail page displays
  And the breadcrumb shows "Catalog > Transformers > Items > Legacy Bulkhead"
  And the page shows item name, character, manufacturer, toy line, size class, year released
```

### Happy Path: Item with photos — gallery and lightbox

```gherkin
Scenario: Item detail shows photo gallery
  Given the item has multiple photos
  When the item detail page loads
  Then the primary photo is displayed prominently
  And thumbnail photos are visible
  And a magnifying glass icon is shown on the displayed photo

Scenario: Clicking a thumbnail changes the displayed photo
  Given the item has multiple photos
  When the user clicks a thumbnail
  Then the main image area updates to show that photo
  And the lightbox does not open

Scenario: Clicking the displayed photo opens the lightbox
  Given the item has multiple photos
  When the user clicks the main displayed photo
  Then a lightbox overlay opens showing the full-size photo at the selected index
  And the lightbox can be closed with the Escape key
  And focus returns to the trigger element after closing

Scenario: Lightbox navigation wraps around
  Given the lightbox is open on the last photo
  When the user clicks Next
  Then the lightbox shows the first photo
  Given the lightbox is open on the first photo
  When the user clicks Previous
  Then the lightbox shows the last photo
```

### Happy Path: Item with links to related pages

```gherkin
Scenario: Item detail links to character, manufacturer, and toy line
  Given the item has a character, manufacturer, and toy line
  When the item detail page loads
  Then the character name is a link to /catalog/:franchise/characters/:slug
  And the manufacturer name is a link to /catalog/manufacturers/:slug
  And the toy line name is a link to /catalog/:franchise/items?toy_line=:slug
```

### Happy Path: Share link button

```gherkin
Scenario: User copies share link from item detail page
  Given the user is on an item detail page
  When they click the "Copy link" button
  Then the page URL is copied to the clipboard
  And the button briefly shows "Copied!" confirmation
```

### Error: Item not found

```gherkin
Scenario: 404 when item slug is invalid
  Given the user navigates to /catalog/transformers/items/nonexistent
  When the API returns 404
  Then an "Item not found" message displays
  And a "Back to Catalog" link is available
```

## Search Sheet Integration

### Happy Path: Character detail sheet in search

```gherkin
Scenario: User selects a character search result and sees full detail
  Given the user is on the search results page with character results
  When they click a character result
  Then the character detail sheet slides in (role="dialog")
  And the sheet shows faction, continuity family, character type
```

## Item Detail Sheet — Share Link

### Happy Path: Copy share link from sheet

```gherkin
Scenario: User copies share link from item detail sheet
  Given the user is on the items browse page with an item selected in the sheet
  When they click the "Copy link" button in the sheet header
  Then the current page URL (with ?selected= param) is copied to the clipboard
```

## API: Character filter on items

### Happy Path: Items filtered by character

```gherkin
Scenario: Items list endpoint accepts character filter
  Given items exist for character "optimus-prime" in franchise "transformers"
  When GET /catalog/franchises/transformers/items?character=optimus-prime
  Then only items for that character are returned
  And total_count reflects the filtered count
```
