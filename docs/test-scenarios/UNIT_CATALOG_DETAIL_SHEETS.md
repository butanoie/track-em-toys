# Unit: Catalog Detail Sheets

Unit test scenarios for the `DetailSheet`, `ItemDetailSheet`, and `CharacterDetailSheet` components that replace the inline detail panels.

## Background

Given the user is authenticated
And catalog data is available via mocked hooks

## DetailSheet (shared shell)

### Renders loading state

```gherkin
Scenario: Sheet shows loading skeleton when data is pending
  Given the sheet is open with isPending=true
  Then a loading skeleton is rendered inside the sheet
```

### Renders error state

```gherkin
Scenario: Sheet shows error message when fetch fails
  Given the sheet is open with isError=true
  Then an error message is rendered: "Failed to load {entityType} details."
```

### Renders title and children

```gherkin
Scenario: Sheet shows title and content when data is loaded
  Given the sheet is open with title="Optimus Prime"
  Then the sheet title displays "Optimus Prime"
  And the children content is visible
  And the dialog has aria-label="{entityType} detail"
```

### Close button calls onOpenChange

```gherkin
Scenario: Clicking close button closes the sheet
  Given the sheet is open
  When the user clicks the close button
  Then onOpenChange is called with false
```

### Actions slot renders

```gherkin
Scenario: Action buttons appear in the sheet header
  Given the sheet is open with actions={<button>Share</button>}
  Then the Share button is visible in the header
```

## ItemDetailSheet

### Closed when slug undefined

```gherkin
Scenario: Sheet is not rendered when no item is selected
  Given itemSlug is undefined
  Then no dialog is rendered
```

### Shows item detail content

```gherkin
Scenario: Sheet shows item information when selected
  Given itemSlug is "optimus-prime" and item data loads
  Then the sheet title shows "Optimus Prime"
  And ItemDetailContent is rendered with the item data
  And AddToCollectionButton is present
```

### Shows character section

```gherkin
Scenario: Sheet shows associated character below item fields
  Given item data has a primary character
  And character data loads
  Then the character section is visible with a heading link
  And CharacterDetailContent is rendered
```

### Curator sees manage photos button

```gherkin
Scenario: Curator role shows camera button in sheet header
  Given the user has curator role
  And itemSlug is set with loaded data
  Then a "Manage photos" button is visible in the header
```

### Non-curator does not see manage photos button

```gherkin
Scenario: Regular user does not see camera button
  Given the user has user role
  And itemSlug is set with loaded data
  Then no "Manage photos" button is rendered
```

### ShareLinkButton present

```gherkin
Scenario: Share link button is in the sheet header
  Given itemSlug is set with loaded data
  Then a "Copy link" button is visible
```

## CharacterDetailSheet

### Closed when slug undefined

```gherkin
Scenario: Sheet is not rendered when no character is selected
  Given characterSlug is undefined
  Then no dialog is rendered
```

### Shows character detail content

```gherkin
Scenario: Sheet shows character information when selected
  Given characterSlug is "optimus-prime" and character data loads
  Then the sheet title shows "Optimus Prime"
  And CharacterDetailContent is rendered with the character data
```

### ShareLinkButton present

```gherkin
Scenario: Share link button is in the sheet header
  Given characterSlug is set with loaded data
  Then a "Copy link" button is visible
```
