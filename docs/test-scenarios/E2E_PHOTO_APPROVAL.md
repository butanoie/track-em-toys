# E2E: Photo Approval Dashboard

## Background

Given the web app is running
And the user is signed in as a curator
And the photo approval API endpoints are available

## Scenarios

### Dashboard Access & Empty State

```gherkin
Scenario: Curator accesses the dashboard via the admin nav
  Given the user is signed in as a curator
  And there are pending photos in the queue
  When they navigate to /admin
  Then the "Admin" sidebar shows a "Photo Approvals" link
  And the link displays an amber notification dot
  When they click "Photo Approvals"
  Then they land on /admin/photo-approvals
  And the first pending photo is displayed in the triage view

Scenario: Empty queue shows the empty state
  Given there are no pending photos
  When the curator navigates to /admin/photo-approvals
  Then they see "No photos awaiting review"
  And there is a "Back to Admin" link
  And the notification dot on the nav is hidden

Scenario: Non-curator cannot access the dashboard
  Given the user is signed in as a regular user (not curator/admin)
  When they navigate to /admin/photo-approvals
  Then they are redirected to the dashboard or see an access-denied message
```

### Single-Image Triage View

```gherkin
Scenario: Triage view shows photo + metadata + existing photos
  Given a pending photo from a contribution
  When the curator views it in the triage view
  Then the hero image is displayed prominently
  And the metadata sidebar shows the item name as a link
  And the sidebar shows the uploader's display name
  And the sidebar shows the contribution consent version and date
  And the sidebar shows up to 3 existing approved photos for the same item

Scenario: GDPR-purged uploader is acknowledged
  Given a pending photo whose uploader has been GDPR-deleted (uploaded_by IS NULL)
  When the curator views it
  Then the uploader field shows "[REDACTED — GDPR]"
  And no other PII is displayed

Scenario: Direct curator upload has no contribution metadata
  Given a pending photo with no associated photo_contributions row
  When the curator views it
  Then the "Contribution" section in the sidebar is hidden or shows "Direct upload"
```

### Approval Flow (Mouse + Keyboard)

```gherkin
Scenario: Curator approves a photo via the Approve button
  Given the curator is on the triage view
  When they click "Approve"
  Then a success toast appears with "Photo approved" and an "Undo" button
  And the photo slides out left
  And the next pending photo slides in from the right
  And the queue position indicator updates (e.g., "2 / 12" → "3 / 12")

Scenario: Curator approves a photo via keyboard shortcut A
  Given the curator is on the triage view
  When they press the "A" key
  Then the same approval flow as the button click occurs

Scenario: Approving the last photo shows the empty state
  Given the queue has 1 pending photo
  When the curator approves it
  Then a success toast appears
  And the empty state replaces the triage view
```

### Rejection Flow

```gherkin
Scenario: Curator rejects with no reason via R-R chord
  Given the curator is on the triage view
  When they press "R" twice within 500ms
  Then a success toast appears with "Photo rejected"
  And the photo's status is updated to 'rejected' with no rejection_reason_code
  And the next photo loads

Scenario: Single R press does NOT reject
  Given the curator is on the triage view
  When they press "R" once
  And wait 1 second
  Then no rejection occurs
  And the photo remains in view

Scenario: Curator rejects with preset reason via numeric key
  Given the curator is on the triage view
  When they press "1" (blurry)
  Then a success toast appears with "Photo rejected (blurry)"
  And the photo's rejection_reason_code is 'blurry'
  And the next photo loads

Scenario: Curator rejects with "other" reason via keyboard shortcut
  Given the curator is on the triage view
  When they press "6" (other)
  Then a free-text input appears for the rejection reason
  And keyboard shortcuts are temporarily disabled while the input is focused
  When they type "Background is distracting" and confirm
  Then the photo's rejection_reason_code is 'other'
  And the rejection_reason_text is "Background is distracting"
  And the next photo loads

Scenario: Curator rejects via mouse and reason dropdown
  Given the curator is on the triage view
  When they click "Reject"
  Then a reason dropdown appears with all 6 preset options
  When they select "Wrong item"
  Then the photo's rejection_reason_code is 'wrong_item'
  And a success toast confirms the action
```

### Undo

```gherkin
Scenario: Curator undoes an accidental approval
  Given the curator just approved a photo
  And the success toast is still visible (5-second window)
  When they click the "Undo" button on the toast
  Then the photo's status reverts to 'pending'
  And the photo reappears in the queue
  And the queue position is restored
  And the photo_contributions row (if any) also reverts to 'pending'

Scenario: Undo after toast expires fails gracefully
  Given the curator just approved a photo
  When 6 seconds pass (toast auto-dismisses)
  Then the undo button is no longer available
  And there is no way to retroactively undo via the dashboard

Scenario: Concurrent toasts have independent undo callbacks
  Given the curator approves photo X
  And immediately approves photo Y (before X's toast dismisses)
  When they click "Undo" on Y's toast
  Then ONLY photo Y is reverted
  And photo X remains approved
```

### Atomic Flip Across Tables

```gherkin
Scenario: Approving a contributed photo updates both tables
  Given a pending photo with a non-revoked photo_contributions row
  When the curator approves it
  Then item_photos.status is 'approved'
  And photo_contributions.status is 'approved'
  And both updated_at timestamps are set in the same transaction

Scenario: Rejecting a direct upload only updates item_photos
  Given a pending photo with NO photo_contributions row (direct curator upload)
  When the curator rejects it
  Then item_photos.status is 'rejected'
  And no error occurs from the missing contribution row
```

### Film-Strip Queue Navigation

```gherkin
Scenario: Curator clicks a film-strip thumbnail to jump
  Given the queue has 5 pending photos
  And the curator is viewing photo 1
  When they click the thumbnail for photo 4 in the film strip
  Then photo 4 becomes the active triage view
  And the active indicator on the film strip moves to position 4

Scenario: Curator navigates with S and D keys
  Given the curator is viewing photo 3 of 5
  When they press "D"
  Then photo 4 becomes active
  When they press "S"
  Then photo 3 becomes active again

Scenario: Pressing D on the last photo wraps to first
  Given the curator is viewing the last photo in the queue
  When they press "D"
  Then the first photo becomes active
```

### Notification Dot

```gherkin
Scenario: Pending count > 0 shows the notification dot
  Given there are 3 pending photos
  When the user navigates to any admin page
  Then the "Photo Approvals" sidebar link shows an amber dot

Scenario: Notification dot updates after a curator action
  Given the dot is visible and the count is 3
  When the curator approves a photo
  Then the count refreshes to 2
  And after approving the last 2 photos, the dot disappears

Scenario: Dot does not poll
  Given the dot is visible
  When the curator stays on the dashboard for 2 minutes without acting
  Then no count refresh requests are made (verified via network tab)
```

### Concurrency & Tombstoned Users

```gherkin
Scenario: Concurrent approval returns 409 and refetches the queue
  Given two curators have the same pending photo open in their dashboards
  When curator A approves photo X
  And curator B then tries to approve photo X
  Then curator B's PATCH request returns 409 with current_status='approved'
  And curator B's UI shows "Photo state has changed — refreshing queue"
  And curator B's queue refetches and no longer shows photo X

Scenario: Tombstoned uploader displays as REDACTED
  Given a pending photo whose uploader was GDPR-deleted (users.deleted_at IS NOT NULL)
  When the curator views the photo
  Then the uploader sidebar field shows "[REDACTED — GDPR]"
  And the API response has uploader=null (not partial PII)

Scenario: Photo with no existing approved photos for the same item
  Given a pending photo for an item with zero approved photos
  When the curator views it
  Then the "Existing Photos" sidebar section is not rendered at all
  And there is no empty placeholder

Scenario: Revoked contribution does not appear in the queue
  Given a user contributed a photo and then revoked it
  When the curator opens the dashboard
  Then the corresponding item_photos row does NOT appear in the queue
  And the curator sees no orphaned photos

Scenario: Photo with file_copied=false does not appear in the queue
  Given a contribution row exists but file_copied is false (crash recovery state)
  When the curator opens the dashboard
  Then that photo is excluded from the queue
  And the curator never sees broken images
```

### "Other" Reason Inline Input

```gherkin
Scenario: Pressing 6 opens an inline input with the curator's free text
  Given the curator is on the triage view
  When they press "6"
  Then an inline text input appears below the action bar
  And the input is auto-focused
  And keyboard shortcuts are suppressed while the input has focus
  When they type "Watermark in lower right"
  And press Enter
  Then the photo's rejection_reason_code is 'other'
  And the rejection_reason_text is "Watermark in lower right"

Scenario: Pressing Esc in the "other" input cancels the entire reject action
  Given the curator pressed 6 and the input is open
  When they press Esc without typing anything
  Then the input closes
  And the photo remains in 'pending' status
  And the curator returns to the triage view

Scenario: Empty "other" text is accepted as code='other', text=null
  Given the curator pressed 6 and the input is open
  When they press Enter without typing
  Then the photo's rejection_reason_code is 'other'
  And the rejection_reason_text is null

Scenario: "Other" text exceeding 500 chars is rejected by the server
  Given the curator types 501 characters into the "other" input
  When they press Enter
  Then the API returns 400 with a validation error
  And an error toast appears
```

### Contribution Intent & Demote-on-Approve

```gherkin
Scenario: Metadata panel shows contributor intent for catalog+training photo
  Given a pending photo whose contribution intent is 'catalog_and_training'
  When the curator views it
  Then the metadata sidebar shows an "Intent: Catalog + Training" badge
  And the action bar shows BOTH "Approve" and "Approve as Training-Only" buttons

Scenario: Metadata panel shows training-only intent
  Given a pending photo whose contribution intent is 'training_only'
  When the curator views it
  Then the metadata sidebar shows an "Intent: Training Only" badge
  And the action bar shows ONLY "Approve" (no demote option, since it's a no-op)
  And the keyboard shortcut T is still bound but acts as a no-op (just approves)

Scenario: Pressing A on a catalog+training photo approves with public visibility
  Given a pending photo with intent='catalog_and_training'
  When the curator presses "A"
  Then the photo's status becomes 'approved'
  And the photo's visibility remains 'public'
  And the photo appears in the public catalog list query

Scenario: Pressing T on a catalog+training photo demotes to training-only
  Given a pending photo with intent='catalog_and_training'
  When the curator presses "T"
  Then the photo's status becomes 'approved'
  And the photo's visibility becomes 'training_only'
  And the photo does NOT appear in the public catalog list query
  And the photo IS included in ML training data exports
  And the photo_contributions.intent remains 'catalog_and_training' (audit unchanged)

Scenario: Pressing T on a training-only photo is a no-op approve
  Given a pending photo with intent='training_only'
  When the curator presses "T"
  Then the photo's status becomes 'approved'
  And the photo's visibility remains 'training_only'
  And no demote action occurs (it was already training-only)

Scenario: API rejects promotion attempts (visibility=public)
  Given the curator's PATCH request body includes visibility='public'
  When the request hits the API
  Then the server returns 422 Unprocessable Entity
  And the error message mentions that promotion requires re-consent

Scenario: Demoted photo disappears from catalog immediately
  Given the curator just demoted photo X with the T key
  When a regular user opens the catalog item detail page for X's item
  Then photo X is NOT in the photo gallery
  And only the public-visibility photos for that item are shown

Scenario: Undoing a demote leaves visibility stale until next decision
  Given the curator demoted photo X with T (intent was catalog+training)
  When they click Undo on the Sonner toast
  Then the photo's status reverts to 'pending'
  And the photo's visibility STAYS at 'training_only' (undo only reverts status)
  And the photo re-enters the queue

Scenario: Re-approving with A after a demote+undo restores public visibility
  Given the curator demoted photo X (intent='catalog+training', visibility now 'training_only')
  And then undid the action (status back to 'pending')
  When they press "A" on photo X
  Then the photo's status becomes 'approved'
  And the photo's visibility is RESTORED to 'public' (path-independent: A always
    honors the contributor's intent regardless of prior visibility state)
  And the photo appears in the public catalog list query
```

### Mutation In-Flight Guards

```gherkin
Scenario: Pressing A twice in rapid succession only fires one mutation
  Given the curator is on the triage view
  When they press "A" twice within 100ms
  Then exactly one PATCH request is fired
  And the second press is ignored because mutation is in flight

Scenario: Modifier-held keys are ignored
  Given the curator is on the triage view
  When they press Cmd+R (browser refresh shortcut)
  Then no rejection chord state is started
  And the browser refresh proceeds normally

Scenario: Keys ignored while keyboard shortcut overlay is open
  Given the keyboard shortcut overlay is visible
  When the curator presses "A"
  Then the overlay does not dismiss via A and no approval fires
  And only Esc dismisses the overlay
```

### Validation & Edge Cases

```gherkin
Scenario: Server rejects rejection_reason_text without code='other'
  Given the curator's PATCH request includes rejection_reason_text="something" with code='blurry'
  When the request hits the API
  Then the server returns 400 with a validation error

Scenario: Server rejects rejection_reason_code without status='rejected'
  Given the curator's PATCH request includes status='approved' with code='blurry'
  When the request hits the API
  Then the server returns 400 with a validation error

Scenario: Queue exceeds 200 — UI shows warning
  Given there are 250 pending photos
  When the curator opens the dashboard
  Then the API returns the first 200 with total_count=250
  And the UI displays a banner warning about the truncated queue

Scenario: Keyboard shortcuts are ignored when typing in the "other" reason input
  Given the rejection reason input is focused
  When the curator presses "A"
  Then the letter "a" is typed into the input
  And no approve action fires
```
