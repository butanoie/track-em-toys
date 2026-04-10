# E2E: Photo Approval Dashboard

## Status

Partial implementation at checkpoint **5b.5** by `web/e2e/curator-photo-approvals.spec.ts`
(curator project, `page.route()` mocking against real auth).

- Scenarios tagged **[5b.5]** are covered by the current spec.
- Scenarios tagged **[deferred]** are forward-looking — behavior that exists in the
  UI but is not covered by automated E2E yet.
- Scenarios tagged **[not-implemented]** describe behavior that was in the
  pre-implementation draft of this doc but was never actually built. They are kept
  as a historical note and explicitly disclaimed.

Earlier drafts of this doc referenced an R-R reject chord, Sonner success toasts, and
an Undo flow. None of those exist in the current implementation:

- The **R-R chord** was removed in commit `e1e09e2` (Phase 1.9b) — the rejection
  reason picker now serves as the confirmation step, so a single R press is enough.
- The feature emits **zero Sonner toasts**. All decision feedback is inline DOM
  state (queue shrinks, next photo shown, conflict banner, empty state).
- **Undo** is not implemented — no toast, no action button, no undo endpoint.

## Background

Given the web app is running
And the user is signed in as a curator
And the photo approval API endpoints (`/admin/photos/pending`, `/admin/photos/pending-count`,
`PATCH /admin/photos/:id/status`) are mocked via `MockPhotoApprovalState` in
`web/e2e/fixtures/mock-helpers.ts`
And the keyboard-shortcut overlay auto-open is suppressed by pre-seeding
`localStorage['photo-approval-shortcuts-seen'] = 'true'` before navigation
And the curator navigates to `/admin/photo-approvals`

## Locator Reference

| Element                         | Playwright locator                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Page heading                    | `getByRole('heading', { name: 'Photo Approvals', level: 1 })`                        |
| Action toolbar                  | `getByRole('toolbar', { name: 'Photo decision actions' })`                           |
| Approve (public) button         | `getByRole('button', { name: /^Approve\s+A$/ })` (`aria-keyshortcuts="A"`)           |
| Approve training only button    | `getByRole('button', { name: /Approve training only\s+T$/ })` (`aria-keyshortcuts="T"`) |
| Reject button                   | `getByRole('button', { name: /^Reject\s+R$/ })` (`aria-keyshortcuts="R"`)            |
| Prev button                     | `getByRole('button', { name: /Prev\s+S$/ })`                                         |
| Next button                     | `getByRole('button', { name: /Next\s+D$/ })`                                         |
| Empty state heading             | `getByRole('heading', { name: 'No pending photos', level: 2 })`                      |
| Conflict banner                 | `getByRole('alert').filter({ hasText: /no longer pending/ })`                        |
| Conflict Dismiss button         | `getByRole('button', { name: 'Dismiss' })`                                           |
| Near-duplicate banner           | `getByRole('alert').filter({ hasText: /Possible duplicate/ })`                       |

**Locator discipline**: both the near-duplicate banner and the conflict banner use
`role="alert"`. Tests MUST disambiguate with `.filter({ hasText: ... })` — never an
unqualified `getByRole('alert')`.

---

## Scenarios Implemented at 5b.5

### S1: Approve public via A hotkey [5b.5]

```gherkin
Scenario: Given a pending photo with catalog_and_training intent, When the curator presses A, Then the photo is approved publicly and removed from the queue
  Given the pending queue contains one photo with contribution.intent='catalog_and_training'
  And that photo has can_decide: true
  When the curator presses the "A" key
  Then a PATCH /admin/photos/:id/status request fires with body { status: 'approved' }
  And the mock responds 200 with the decision response shape
  And the TanStack Query invalidation triggers a refetch of /admin/photos/pending
  And the mock returns a queue with the approved photo removed
  And the next pending photo (or the empty state) is rendered
```

### S2: Approve training-only via T hotkey [5b.5]

```gherkin
Scenario: Given a pending photo, When the curator presses T, Then the photo is approved with training_only visibility
  Given the pending queue contains a photo the curator can decide
  When the curator presses the "T" key
  Then a PATCH /admin/photos/:id/status request fires with body
    { status: 'approved', visibility: 'training_only' }
  And the photo is removed from the queue on refetch
  And the next photo (or empty state) is rendered
```

### S3: Reject via R then click Blurry [5b.5]

```gherkin
Scenario: Given a pending photo, When the curator presses R and clicks Blurry, Then the photo is rejected with code 'blurry'
  Given the pending queue contains a photo the curator can decide
  And the rejection reason picker is closed
  When the curator presses the "R" key
  Then the rejection reason picker group is visible
  When the curator clicks the "Blurry" reason button
  Then a PATCH /admin/photos/:id/status request fires with body
    { status: 'rejected', rejection_reason_code: 'blurry' }
  And the rejection_reason_text field is not present in the body
  And the photo is removed from the queue on refetch
```

### S4: training_only intent disables public Approve button [5b.5]

```gherkin
Scenario: Given a pending photo whose contributor chose training_only, When the curator views it, Then the public Approve button is disabled
  Given the pending queue's active photo has contribution.intent='training_only'
  When the triage view renders
  Then the "Approve" button is disabled
  And its title attribute contains "training-only"
  And the "Approve training only" button is enabled
  And the "Reject" button is enabled
  # Hotkey A is also gated by canApprovePublic; asserted by unit tests in PhotoApprovalPage.test.tsx — E2E only asserts button state to avoid negative hotkey assertions.
```

### S5: Near-duplicate warning banner at distance ≤ 4 [5b.5]

```gherkin
Scenario: Given a pending photo with an existing approved photo at Hamming distance ≤ 4 for the same item, When the curator views it, Then the near-duplicate warning banner is visible
  Given the pending queue's active photo has existing_photos[0].distance = 3
  When the triage view renders
  Then a role="alert" element containing "Possible duplicate" is visible
  And it names the item and shows the distance value
```

### S6: Empty state after decisioning last photo [5b.5]

```gherkin
Scenario: Given a single pending photo, When the curator approves it, Then the empty state is rendered
  Given the pending queue contains exactly one photo with catalog_and_training intent
  When the curator presses the "A" key
  Then the mock returns an empty queue on the refetch
  And the empty state heading "No pending photos" is visible
  And the paragraph "You're all caught up. New contributions will appear here." is visible
  And no triage view, action toolbar, or film strip is rendered
```

### S7: Self-review gate (can_decide: false) [5b.5]

```gherkin
Scenario: Given a pending photo the curator contributed themselves, When the curator views it, Then all three decision buttons are disabled
  Given the pending queue's active photo has can_decide: false
  And contribution.contributed_by is a fake UUID (not asserted against)
  When the triage view renders
  Then the "Approve" button is disabled
  And the "Approve training only" button is disabled
  And the "Reject" button is disabled
  And their title attribute contains "You contributed this photo"
  And the "Prev" and "Next" buttons remain enabled
```

### S8: 409 conflict banner + Dismiss [5b.5]

```gherkin
Scenario: Given another curator already decided the active photo, When the curator tries to approve, Then the 409 conflict banner appears and Dismiss clears it
  Given the mock is primed with setNextDecideResponse({
    status: 409,
    body: { error: 'Photo is not pending', current_status: 'approved' }
  })
  When the curator presses the "A" key
  Then a PATCH /admin/photos/:id/status request fires
  And the mock responds 409 with the primed body
  And decidePhoto() in api.ts parses the body and returns { conflict: true, current_status: 'approved' }
  And a role="alert" element containing "no longer pending" is visible
  And the element contains the text "approved" (the current_status value)
  And a "Dismiss" button is visible inside the banner
  When the curator clicks "Dismiss"
  Then the conflict banner is removed from the DOM
  # Keyboard-suppressed-while-conflict-visible is covered by unit tests; E2E does not negative-assert hotkey behavior.
```

---

## Deferred Scenarios (forward-looking, not automated)

The following scenarios describe real, implemented behavior that is intentionally out
of scope for checkpoint 5b.5. They stay in this doc as documentation for future
automation.

### Film-Strip Queue Navigation [deferred]

```gherkin
Scenario: Curator navigates with S and D keys
  Given the curator is viewing photo 3 of 5
  When they press "D"
  Then photo 4 becomes active
  When they press "S"
  Then photo 3 becomes active again

Scenario: Curator clicks a film-strip thumbnail to jump
  Given the queue has 5 pending photos
  When they click the thumbnail for photo 4 in the film strip
  Then photo 4 becomes the active triage view
```

### Rejection Picker — Other Free Text [deferred]

```gherkin
Scenario: Curator rejects with "other" reason via free-text input
  Given the reject picker is open
  When they click the "Other" reason button
  Then an inline text input appears and is auto-focused
  When they type "Background is distracting" and press Enter
  Then a PATCH fires with body {
    status: 'rejected',
    rejection_reason_code: 'other',
    rejection_reason_text: 'Background is distracting'
  }
```

### Reject Picker — Numeric Hotkeys [deferred]

```gherkin
Scenario: Curator presses R then 1 to reject as Blurry via keyboard
  Given the reject picker is open
  When they press "1"
  Then a PATCH fires with body { status: 'rejected', rejection_reason_code: 'blurry' }
  And the rejection_reason_text field is not present
```

### Keyboard Shortcut Overlay [deferred]

```gherkin
Scenario: First visit auto-opens the shortcut overlay
  Given localStorage['photo-approval-shortcuts-seen'] is not set
  When the curator navigates to /admin/photo-approvals
  Then the keyboard shortcut dialog is visible
  When the curator presses Esc
  Then the dialog closes
  And localStorage['photo-approval-shortcuts-seen'] is set to 'true'

Scenario: Shift+/ reopens the overlay
  Given the overlay is closed
  When the curator presses Shift+/
  Then the dialog becomes visible
```

### Sidebar Notification Dot [deferred]

```gherkin
Scenario: Pending count > 0 shows the notification dot
  Given the /admin/photos/pending-count endpoint returns { count: 3 }
  When the curator is on any admin page
  Then the "Photo Approvals" sidebar link has an aria-label containing "pending photos"
```

### Contributor Intent Demote Semantics [deferred]

```gherkin
Scenario: Pressing T on a catalog_and_training photo demotes visibility
  Given a pending photo with contribution.intent='catalog_and_training'
  When the curator presses "T"
  Then a PATCH fires with body { status: 'approved', visibility: 'training_only' }
  And the photo is approved but will not appear in the public catalog
  # The inverse (pressing A) is covered by scenario S1 at 5b.5.
```

### Conflict Banner — Keyboard Suppression [deferred]

```gherkin
Scenario: While the conflict banner is visible, decision hotkeys are suppressed
  Given the conflict banner is visible
  When the curator presses "A"
  Then no PATCH request fires
  When the curator presses Dismiss or Esc
  Then the banner is cleared
  And the decision hotkeys become active again
```

---

## Not-Implemented Scenarios (historical, kept as disclaimer)

The following scenarios were in earlier drafts of this doc but describe code that was
never built. They are kept as a disclaimer so readers don't assume they are
forthcoming.

### R-R reject chord [not-implemented]

The R-R "reject + confirm" chord was part of the original design but was replaced
with a single R press that opens the inline rejection reason picker. The reason
picker itself now serves as the confirmation step. See commit `e1e09e2`.

### Sonner success toast with Undo button [not-implemented]

Originally the doc described `toast.success('Photo approved')` with a 5-second Undo
button. The feature ships with zero Sonner toasts on the approval page — all
feedback is inline DOM state. There is no undo endpoint, no undo toast, and no undo
UI. If undo becomes a requirement, it needs backend support (reverting
`photo_contributions.status` atomically with `item_photos.status`) before any UI
work.

### "Back to Admin" link in empty state [not-implemented]

The empty state is a heading plus a single paragraph:

> **No pending photos**
> You're all caught up. New contributions will appear here.

There is no back-navigation link. Admin sidebar navigation handles the back path.

---

## Mapping to test IDs

| Scenario | Test title in `curator-photo-approvals.spec.ts`                                                          |
| -------- | -------------------------------------------------------------------------------------------------------- |
| S1       | `Given a pending photo, When the curator presses A, Then the photo is approved publicly and removed`    |
| S2       | `Given a pending photo, When the curator presses T, Then the photo is approved as training_only`        |
| S3       | `Given a pending photo, When the curator rejects via R then Blurry, Then the photo is rejected with code blurry` |
| S4       | `Given a training_only intent photo, When it renders, Then the public Approve button is disabled`       |
| S5       | `Given an existing photo at distance 3, When the photo renders, Then the near-duplicate banner shows`   |
| S6       | `Given one pending photo, When it is approved, Then the empty state is shown`                           |
| S7       | `Given a photo the curator contributed, When it renders, Then all decision buttons are disabled`        |
| S8       | `Given a primed 409 response, When the curator approves, Then the conflict banner shows and dismisses`  |
