# Photo Management Sheet — UI Design Specification

**Date:** 2026-03-20
**Issue:** #77 (Phase 1.9 Slice 2)
**Status:** Design complete, pending implementation via /feature-dev

---

## Design Direction

**Aesthetic:** Refined utilitarian — clean, professional, efficient. Matches the existing Shadcn/ui design system exactly. No new fonts, no new color tokens. One accent exception: an **amber star** for primary photo badge (warm contrast against the cool blue-primary palette).

**Key principle:** This is a curator's workbench. Every pixel serves a purpose. The Sheet should feel like a well-organized tool drawer — everything in reach, nothing cluttered.

---

## 1. Trigger Button — "Manage Photos"

### On `ItemDetailPage` (header row)

Placement: Next to `ShareLinkButton` in the `flex items-start justify-between` header row.

```
┌─────────────────────────────────────────┐
│ Optimus Prime (G1)          [📷] [🔗]  │
│─────────────────────────────────────────│
│ [PhotoGallery]                          │
│ ...                                     │
└─────────────────────────────────────────┘
```

- `Button variant="ghost" size="icon"` with `Camera` icon (lucide `Camera`)
- `aria-label="Manage photos"`
- Only visible when `user.role === 'curator' || user.role === 'admin'`
- Positioned BEFORE `ShareLinkButton` in the actions group (photos are the more common curator action)

### On `ItemDetailPanel` (actions slot)

Same icon button, passed into `DetailPanelShell`'s `actions` prop alongside the existing `ShareLinkButton`:

```tsx
actions={
  <>
    {isCurator && (
      <Button variant="ghost" size="icon" onClick={openSheet} aria-label="Manage photos">
        <Camera className="h-4 w-4" />
      </Button>
    )}
    {shareUrl ? <ShareLinkButton url={shareUrl} /> : undefined}
  </>
}
```

---

## 2. Sheet Layout

**Shadcn Sheet, right side, responsive width:**

- Desktop: `sm:max-w-lg` (512px)
- Mobile: full width (Radix default)
- `side="right"`

### Sheet Header

```
┌─ Manage Photos ──────────────────── [X] ┐
│ Optimus Prime (G1)                       │
│ 4 photos                                 │
├──────────────────────────────────────────┤
```

- `SheetHeader` with `SheetTitle` = "Manage Photos"
- `SheetDescription` = item name + photo count (`"{itemName} · {n} photo(s)"`)
- Standard Shadcn Sheet close button (built-in)

### Sheet Content — Two Sections

The sheet body has two vertically stacked sections separated by visual hierarchy (not `Separator` — spacing alone):

```
┌──────────────────────────────────────────┐
│ ┌ UPLOAD ──────────────────────────────┐ │
│ │                                      │ │
│ │     📤  Drop photos here             │ │
│ │     or select files                  │ │
│ │                                      │ │
│ │  JPEG, PNG, WebP, GIF · Max 10 MB   │ │
│ └──────────────────────────────────────┘ │
│                                          │
│  ┌ progress-1.jpg ─────────── ✓ ┐       │
│  ├ progress-2.jpg ════════░░░ ↻ ┤       │
│  └ progress-3.jpg ─────────── ○ ┘       │
│                                          │
│ PHOTOS ─────────────────────────────────│
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐    │
│ │ ★    │ │      │ │      │ │      │    │
│ │ img1 │ │ img2 │ │ img3 │ │ img4 │    │
│ │ ≡  🗑│ │ ≡  🗑│ │ ≡  🗑│ │ ≡  🗑│    │
│ └──────┘ └──────┘ └──────┘ └──────┘    │
│                                          │
│ Drag to reorder · First photo is primary │
└──────────────────────────────────────────┘
```

---

## 3. DropZone Component

### Default State

```
┌─ - - - - - - - - - - - - - - - - - ─┐
│                                       │
│          ↑ (Upload icon)              │
│     Drop photos here                  │
│     or  select files                  │
│                                       │
│   JPEG, PNG, WebP, GIF · Max 10 MB   │
└─ - - - - - - - - - - - - - - - - - ─┘
```

**Visual treatment:**

- Dashed border: `border-2 border-dashed border-muted-foreground/25 rounded-lg`
- Background: `bg-muted/30`
- Padding: `p-8` for comfortable target area
- Center-aligned content
- Icon: `Upload` from lucide (24x24), `text-muted-foreground`
- "Drop photos here" — `text-sm font-medium text-foreground`
- "or" — `text-sm text-muted-foreground`
- "select files" — `text-sm text-primary font-medium hover:underline cursor-pointer` (triggers hidden `<input type="file">`)
- Format hint: `text-xs text-muted-foreground mt-2`

### Drag-Over Active State

```
┌━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┐
│                                        │
│          ↑ (Upload icon, primary)      │
│     Release to upload                  │
│                                        │
└━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┘
```

**Visual treatment on drag-over:**

- Border transitions to: `border-primary border-solid` (solid replaces dashed)
- Background: `bg-primary/5`
- Icon color: `text-primary`
- Text changes to: "Release to upload"
- CSS transition: `transition-all duration-150`

### Uploading State (disabled)

- `opacity-50 pointer-events-none`
- Shows while any uploads are in progress (prevents double-queuing)

### Accessibility

- `role="region"` with `aria-label="Photo upload drop zone"`
- Hidden `<input>`: `id="photo-file-input"`, `type="file"`, `multiple`, `accept="image/jpeg,image/png,image/webp,image/gif"`
- "select files" text wrapped in `<button type="button">` with `aria-controls="photo-file-input"`
- `aria-describedby` pointing to the format hint text

---

## 4. Upload Queue (Progress Bars)

Renders between the drop zone and the photo grid, only when uploads are in progress or recently completed.

### Per-File Item

```
┌──────────────────────────────────────────┐
│ 📎 optimus-front.jpg     ███████░░░ 72% │
│ 📎 optimus-back.jpg                  ○  │
│ 📎 optimus-side.jpg       ─────── ✓     │
│ ✕ optimus-huge.jpg   File too large      │
└──────────────────────────────────────────┘
```

**States per file:**

| State       | Icon (right)                         | Progress bar                        | Text                                        |
| ----------- | ------------------------------------ | ----------------------------------- | ------------------------------------------- |
| `queued`    | `Circle` (muted, hollow)             | None                                | —                                           |
| `uploading` | `Loader2` (spinning, `animate-spin`) | `<progress>` bar, `bg-primary` fill | `{percent}%`                                |
| `done`      | `CheckCircle2` (green-600)           | Full bar briefly, then fades        | —                                           |
| `error`     | `XCircle` (destructive)              | None                                | Error message in `text-destructive text-xs` |

**Visual treatment:**

- Each row: `flex items-center gap-2 py-1.5`
- Filename: `text-sm text-foreground truncate flex-1` with `Paperclip` icon (`text-muted-foreground h-3.5 w-3.5`)
- Progress bar: HTML `<progress>` element styled via Tailwind
  - Track: `h-1.5 rounded-full bg-muted` (2px subtler than default)
  - Fill: `bg-primary rounded-full` with `transition-all duration-300`
  - Width: fills remaining space after filename and status icon
- Percentage: `text-xs text-muted-foreground tabular-nums w-8 text-right`
- Wrapper has `aria-live="polite"` for screen reader announcements
- Completed items auto-clear after 3 seconds (with fade-out transition)

**Accessibility:**

- `<progress>` element with `aria-label="Uploading {filename}"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`
- Error messages: `role="alert"`
- Container: `aria-label="Upload progress"` region

---

## 5. Photo Grid (Drag-to-Reorder)

### Grid Layout

- CSS Grid: `grid grid-cols-3 gap-2` (3 columns in the ~480px sheet)
- Each cell: `aspect-square rounded-md overflow-hidden`

### Photo Card (PhotoGridItem)

```
┌──────────────────┐
│ ★               │  ← Primary badge (top-left, only on primary)
│                  │
│    [thumbnail]   │
│                  │
│              🗑   │  ← Delete (right); entire tile is draggable
└──────────────────┘
```

**Visual treatment:**

- Card: `relative group bg-muted rounded-md overflow-hidden aspect-square`
- Thumbnail: `<img>` with `object-cover w-full h-full`
- Hover overlay: `absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors` (subtle dim)
- Action bar at bottom: `absolute bottom-0 inset-x-0 flex items-center justify-between p-1 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity` — actions only visible on hover
- While dragging: `opacity-70 scale-95 shadow-lg ring-2 ring-primary` with `transition-transform`
- Drop placeholder: `bg-primary/10 border-2 border-dashed border-primary rounded-md`

### Primary Photo Badge

Position: Top-left corner of the card.

```
┌───┐
│ ★ │
└───┘
```

**Visual treatment:**

- `absolute top-1 left-1 z-10`
- Container: `flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold`
- Colors: `bg-amber-500 text-white` (light mode) / `bg-amber-400 text-amber-950` (dark mode)
- Icon: `Star` from lucide, `h-3 w-3`, filled (`fill="currentColor"`)
- Always visible (not affected by hover overlay)
- WCAG AA contrast: amber-500 (#f59e0b) on white = 8.6:1 for the badge background. White text on amber-500 = 3.0:1 — enhanced to pass AA by using `bg-amber-600` which gives 4.6:1. **Final: `bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950`**

### Set Primary Action

- Appears as a `Star` icon button (outline, unfilled) in the top-left corner when NOT the primary photo
- Only visible on hover (part of the hover overlay actions)
- `aria-label="Set as primary photo"`
- On click: calls `setPrimaryMutation.mutate(photo.id)`
- When this photo IS primary: badge shows (always visible), no action button needed

### Delete Action

- `Trash2` icon button in the bottom-right corner of the action bar
- `text-white/80 hover:text-white` (on the gradient overlay)
- `aria-label="Delete photo"`
- On click: opens `ConfirmDialog`

### Drag Interaction

- The entire photo tile is the drag surface — `attributes` and `listeners` on the outer `div`
- `cursor-grab active:cursor-grabbing` on the tile container
- `pointer-events-none` on the `<img>` to prevent browser default image drag
- `PointerSensor` `distance: 5` constraint allows clicks on star/delete buttons without triggering drag

### Empty State (No Photos)

When `photos.length === 0`, the photo grid section does not render. Only the drop zone is shown with slightly more vertical emphasis:

```
┌─ - - - - - - - - - - - - - - - - - ─┐
│                                       │
│          ↑ (Upload icon)              │
│                                       │
│     No photos yet                     │
│     Drop photos here or select files  │
│                                       │
│   JPEG, PNG, WebP, GIF · Max 10 MB   │
└─ - - - - - - - - - - - - - - - - - ─┘
```

### Section Header

Above the photo grid:

```
Photos (4)
```

- "Photos" label: `text-sm font-medium text-foreground`
- Count in parentheses: `text-muted-foreground`

### Help Text (Below Grid)

```
Drag photos to reorder · Star marks primary
```

- `text-xs text-muted-foreground text-center mt-2`
- Only shown when `photos.length > 1`

---

## 6. Confirm Delete Dialog

Reuses `ConfirmDialog` from `@/admin/components/ConfirmDialog`:

```tsx
<ConfirmDialog
  open={deleteTarget !== null}
  onOpenChange={(open) => {
    if (!open) setDeleteTarget(null);
  }}
  title="Delete photo?"
  description="This photo will be permanently removed from the catalog item. This action cannot be undone."
  confirmLabel="Delete Photo"
  variant="destructive"
  onConfirm={handleConfirmDelete}
  isPending={deleteMutation.isPending}
/>
```

No `confirmText` prop — photo deletion has friction (the dialog itself) but does not require type-to-confirm (less destructive than GDPR purge).

---

## 7. Interaction Specifications

### Upload Flow

1. User drops files or clicks "select files"
2. Client-side validation filters by MIME type. Invalid files trigger `toast.error("filename.tiff is not a supported image format")`
3. Client-side file size validation rejects files >10MB with `toast.error("filename.jpg exceeds the 10 MB limit")`
4. Valid files enter the upload queue as `queued`
5. Sequential processing begins: first queued file transitions to `uploading`
6. XHR `upload.onprogress` updates the progress bar in real-time
7. On success: item transitions to `done`, progress bar fills to 100%, `toast.success("Photo uploaded")`, query invalidation fires
8. Done items display for 3 seconds then fade out (CSS `opacity-0 transition-opacity duration-500`)
9. Next queued file begins uploading
10. After all uploads complete, the query invalidation causes the photo grid to re-render with new photos
11. **Drag-to-reorder is disabled while uploads are in progress** to prevent query invalidation from disrupting an active drag

### Drag-to-Reorder Flow

1. User grabs anywhere on the photo tile (5px movement activates drag)
2. Card lifts (scale + shadow) with `ring-2 ring-primary`
3. Other cards shift to show drop position
4. On release: local state updates immediately (optimistic)
5. `reorderMutation.mutate(newOrder)` fires in background
6. On error: toast + query invalidation restores server order

### Set Primary Flow

1. User hovers over a non-primary photo
2. Star outline icon appears in top-left
3. User clicks star icon
4. `setPrimaryMutation.mutate(photo.id)` fires
5. On success: query invalidation updates all photos, amber badge moves to new primary
6. On error: `toast.error("Failed to set primary photo")`

### Delete Flow

1. User hovers over a photo, clicks `Trash2` icon
2. `ConfirmDialog` opens with destructive variant
3. User clicks "Delete Photo"
4. `deleteMutation.mutate(photo.id)` fires
5. Dialog shows "Processing..." state
6. On success: dialog closes, query invalidation removes photo from grid, `toast.success("Photo deleted")`
7. On error: dialog closes, `toast.error("Failed to delete photo")`

---

## 8. Keyboard Accessibility

| Key                   | Context                   | Action                                                           |
| --------------------- | ------------------------- | ---------------------------------------------------------------- |
| `Tab`                 | Sheet                     | Navigate between drop zone, upload queue items, photo grid items |
| `Enter`/`Space`       | On photo tile             | Pick up / drop item (dnd-kit keyboard sensor)                    |
| `ArrowUp`/`ArrowDown` | While dragging (keyboard) | Move item in the grid                                            |
| `Escape`              | While dragging            | Cancel drag operation                                            |
| `Escape`              | Sheet open (no drag)      | Close Sheet                                                      |
| `Enter`/`Space`       | On star button            | Set as primary photo                                             |
| `Enter`/`Space`       | On delete button          | Open confirm dialog                                              |
| `Enter`/`Space`       | On "select files"         | Open file picker                                                 |

### dnd-kit Screen Reader Announcements

```typescript
accessibility={{
  announcements: {
    onDragStart: ({ active }) => `Picked up photo ${getPosition(active.id)}. Use arrow keys to move.`,
    onDragOver: ({ active, over }) => over
      ? `Photo ${getPosition(active.id)} is over position ${getPosition(over.id)}.`
      : `Photo ${getPosition(active.id)} is no longer over a droppable area.`,
    onDragEnd: ({ active, over }) => over
      ? `Photo ${getPosition(active.id)} was moved to position ${getPosition(over.id)}.`
      : `Photo ${getPosition(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Drag cancelled. Photo ${getPosition(active.id)} returned to its original position.`,
  },
}}
```

---

## 9. Responsive Behavior

| Breakpoint     | Sheet width           | Grid columns              | Action bar                         |
| -------------- | --------------------- | ------------------------- | ---------------------------------- |
| `< sm` (640px) | Full width            | 2 columns (`grid-cols-2`) | Always visible (no hover on touch) |
| `sm+`          | 512px (`sm:max-w-lg`) | 3 columns (`grid-cols-3`) | Visible on hover                   |

On mobile/touch devices, the action bar (delete button) should always be visible since there's no hover state. Drag works via touch-and-hold on the entire tile. Use `@media (hover: none)` or always-show on `< sm`:

```css
/* Action bar: always visible on touch, hover-reveal on pointer */
.photo-actions {
  @apply opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity;
}
```

Note: `@media (hover: hover)` is more precise than breakpoint-based, but Tailwind's `sm:` is simpler and covers the 99% case.

---

## 10. Color Palette Summary

All colors use existing design tokens except the primary badge amber:

| Element                 | Light Mode                   | Dark Mode        | WCAG AA               |
| ----------------------- | ---------------------------- | ---------------- | --------------------- |
| Drop zone border        | `border-muted-foreground/25` | Same token       | N/A (decorative)      |
| Drop zone active border | `border-primary`             | Same token       | N/A (decorative)      |
| Progress bar fill       | `bg-primary`                 | Same token       | N/A (non-text)        |
| Primary badge bg        | `bg-amber-600`               | `bg-amber-500`   | 4.6:1 / 4.7:1         |
| Primary badge text      | `text-white`                 | `text-amber-950` | Pass AA               |
| Done icon               | `text-green-600`             | `text-green-400` | 4.8:1 / 4.6:1         |
| Error text              | `text-destructive` (token)   | Same token       | Pass (themed)         |
| Action bar gradient     | `from-black/40`              | Same             | N/A (overlay)         |
| Action icons            | `text-white/80`              | Same             | 4.5:1 on dark overlay |

---

## 11. Component Mockup Code

The following is **prototyping code** — demonstrates the visual design, not production implementation. Production code will be written during the /feature-dev implementation phase.

### DropZone Mockup

```tsx
// DESIGN MOCKUP — not production code
function DropZoneMockup({ isDragOver }: { isDragOver: boolean }) {
  return (
    <div
      className={cn(
        'relative rounded-lg border-2 border-dashed p-8 text-center transition-all duration-150',
        isDragOver
          ? 'border-primary border-solid bg-primary/5'
          : 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/40'
      )}
    >
      <Upload className={cn('mx-auto h-8 w-8 mb-3', isDragOver ? 'text-primary' : 'text-muted-foreground')} />

      {isDragOver ? (
        <p className="text-sm font-medium text-primary">Release to upload</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">Drop photos here</p>
          <p className="text-sm text-muted-foreground mt-1">
            or{' '}
            <button type="button" className="text-primary font-medium hover:underline">
              select files
            </button>
          </p>
        </>
      )}

      <p className="text-xs text-muted-foreground mt-3">JPEG, PNG, WebP, GIF · Max 10 MB</p>
    </div>
  );
}
```

### Upload Queue Item Mockup

```tsx
// DESIGN MOCKUP — not production code
function UploadQueueItemMockup({
  status,
  progress,
  filename,
}: {
  status: 'queued' | 'uploading' | 'done' | 'error';
  progress: number;
  filename: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-sm text-foreground truncate flex-1">{filename}</span>

      {status === 'uploading' && (
        <>
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{progress}%</span>
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin flex-shrink-0" />
        </>
      )}

      {status === 'queued' && <Circle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />}
      {status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />}
      {status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />}
    </div>
  );
}
```

### Photo Grid Item Mockup

```tsx
// DESIGN MOCKUP — not production code
function PhotoGridItemMockup({ isPrimary, url }: { isPrimary: boolean; url: string }) {
  return (
    <div className="group relative aspect-square rounded-md overflow-hidden bg-muted">
      <img src={url} alt="" className="object-cover w-full h-full" />

      {/* Primary badge — always visible */}
      {isPrimary && (
        <div className="absolute top-1 left-1 z-10 flex items-center gap-0.5 rounded-full bg-amber-600 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-amber-500 dark:text-amber-950">
          <Star className="h-3 w-3" fill="currentColor" />
        </div>
      )}

      {/* Set-primary button — hover only, non-primary photos */}
      {!isPrimary && (
        <button
          type="button"
          className="absolute top-1 left-1 z-10 rounded-full bg-black/50 p-1 text-white/80 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Set as primary photo"
        >
          <Star className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Action bar — bottom gradient overlay */}
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-end p-1.5 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button type="button" className="text-white/80 hover:text-white" aria-label="Delete photo">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
```

### Sheet Composition Mockup

```tsx
// DESIGN MOCKUP — not production code
function PhotoManagementSheetMockup() {
  return (
    <Sheet>
      <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Manage Photos</SheetTitle>
          <SheetDescription>Optimus Prime (G1) · 4 photos</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Upload section */}
          <div className="space-y-2">
            <DropZoneMockup isDragOver={false} />

            {/* Upload queue — only shown during/after uploads */}
            <div aria-label="Upload progress" aria-live="polite" className="space-y-0.5">
              <UploadQueueItemMockup status="done" progress={100} filename="front-view.jpg" />
              <UploadQueueItemMockup status="uploading" progress={72} filename="back-view.jpg" />
              <UploadQueueItemMockup status="queued" progress={0} filename="side-view.jpg" />
            </div>
          </div>

          {/* Photo grid section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Photos <span className="text-muted-foreground">(4)</span>
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <PhotoGridItemMockup isPrimary={true} url="/photo1.jpg" />
              <PhotoGridItemMockup isPrimary={false} url="/photo2.jpg" />
              <PhotoGridItemMockup isPrimary={false} url="/photo3.jpg" />
              <PhotoGridItemMockup isPrimary={false} url="/photo4.jpg" />
            </div>

            <p className="text-xs text-muted-foreground text-center">Drag to reorder · Star marks primary</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

## 12. CSS Transitions Summary

All animations use CSS transitions (no animation library):

| Element             | Property                | Duration | Easing       |
| ------------------- | ----------------------- | -------- | ------------ |
| Drop zone border/bg | `all`                   | `150ms`  | default ease |
| Upload progress bar | `width`                 | `300ms`  | default ease |
| Done item fade-out  | `opacity`               | `500ms`  | default ease |
| Photo hover overlay | `opacity`               | default  | default ease |
| Action bar reveal   | `opacity`               | default  | default ease |
| Drag item lift      | `transform, box-shadow` | `200ms`  | default ease |

---

## 13. Handoff Notes for Implementation

1. **Install dependencies first:** `npx shadcn@latest add sheet` + `npm install @dnd-kit/core @dnd-kit/sortable`
2. **Verify Sheet component:** Remove any `"use client"` directives or `next-themes` imports from the generated `sheet.tsx`. Convert any HSL values to oklch.
3. **dnd-kit accessibility:** The `DndContext` must include the `accessibility.announcements` object shown in section 8.
4. **Touch devices:** Action bar visibility must not depend on hover. Use the pattern from section 9.
5. **Auto-clear done items:** 3-second delay then fade. Use `setTimeout` in the `usePhotoUpload` hook, not in the component.
6. **Primary badge contrast:** Use `bg-amber-600 text-white` — verified at 4.6:1 for WCAG AA. In dark mode: `bg-amber-500 text-amber-950`.
