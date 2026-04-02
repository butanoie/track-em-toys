# E2E: ML Photo Identification

## Background

Given the web app is running
And a user is signed in
And ML model metadata API is available

## Scenarios

### Add by Photo — Sheet Lifecycle

#### Happy Path: User opens Add by Photo sheet from collection page

```gherkin
Scenario: Add by Photo button opens identification sheet
  Given the user has a populated collection
  And ML models are available
  When they click "Add by Photo" on the collection page
  Then the "Identify by Photo" sheet opens
  And a photo drop zone is visible
```

#### Happy Path: Photo upload triggers classification and shows results

```gherkin
Scenario: User uploads a photo and receives predictions
  Given the "Identify by Photo" sheet is open
  And ML models are available
  When the user selects a photo file
  Then the model is downloaded (or loaded from cache)
  And the photo is classified
  And up to 5 prediction cards are displayed
  And each card shows item name, details, confidence bar, and Add button
```

#### Happy Path: User adds item to collection from prediction

```gherkin
Scenario: User clicks Add on a prediction card
  Given prediction results are displayed
  When the user clicks "Add" on a prediction card
  Then the Add to Collection dialog opens
  When the user selects a condition and confirms
  Then the item is added to their collection
  And a success toast appears
```

### Add by Photo — Alternate Flows

#### Alternate: No models available shows fallback

```gherkin
Scenario: No ML models configured
  Given the ML models API returns an empty list
  When the user opens Add by Photo
  Then a "not yet available" message is shown
  And a "Browse Catalog" link is visible
```

#### Alternate: Try another photo resets to drop zone

```gherkin
Scenario: User clicks Try another photo after results
  Given prediction results are displayed
  When the user clicks "Try another photo"
  Then the drop zone is shown again
  And the previous results are cleared
```

#### Alternate: Classification error shows error state

```gherkin
Scenario: Model download or inference fails
  Given the user uploads a photo
  And the model download or inference fails
  Then an error message is displayed
  And "Try again" and "Browse catalog" buttons are visible
```

### Admin ML Stats Dashboard

#### Guard: Non-admin cannot access ML stats

```gherkin
Scenario: Regular user navigates to /admin/ml
  Given the user has role "user"
  When they navigate to /admin/ml
  Then they are redirected to /
```

#### Happy Path: Admin sees ML stats dashboard

```gherkin
Scenario: Admin views ML stats
  Given the user has role "admin"
  And ML stats data exists
  When they navigate to /admin/ml
  Then stat cards show Total Scans, Acceptance Rate, Error Rate, Completed
  And a daily activity chart is rendered
  And a model comparison chart is rendered
```

#### Happy Path: Admin changes date range

```gherkin
Scenario: Admin selects different date range
  Given the admin is on the ML stats page
  When they select "Last 30 days" from the dropdown
  Then the URL updates with days=30
  And the stats refresh with the new range
```

#### Happy Path: Admin default redirect to ML stats

```gherkin
Scenario: Admin navigates to /admin
  Given the user has role "admin"
  When they navigate to /admin
  Then they are redirected to /admin/ml
```
