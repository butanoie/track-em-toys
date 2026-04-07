---
paths:
  - 'web/src/**/*.tsx'
  - 'web/src/**/*.ts'
---

# Web Component & Domain Patterns

## User Roles & Admin UI (Detailed Patterns)

- Shared `AppHeader` component (`src/components/AppHeader.tsx`) replaces duplicate header code in Dashboard and Settings
- Admin layout `<main>` already has `p-4 sm:p-6 lg:p-8` — child pages must NOT add their own padding (double-padding). Use `<div className="space-y-6">` as the top-level wrapper, matching `AdminUsersPage`
- Admin data table uses `placeholderData: keepPreviousData` for smooth pagination (no skeleton flash between pages)
- URL search params (not React state) for admin filter/pagination state — bookmarkable, survives refresh
- `ConfirmDialog` pattern for destructive actions: generic component in `src/admin/components/`, reusable for deactivation, purge, and future catalog deletes
- GDPR-purged users (tombstones): show "Deleted user" for email, "—" for name, disable all action buttons
- Self-action guard: disable role/deactivate/purge controls when `row.id === currentUser.id`
- Role changes also go through `ConfirmDialog` (simple "Are you sure?" — no type-to-confirm since reversible)
- `LoadingSpinner` shared component at `src/components/LoadingSpinner.tsx` — accepts `className` for contextual sizing
- `throwApiError(response)` in `api-client.ts` — shared error extraction for void-response endpoints (DELETE 204)
- `buildHeaders()` only sets `Content-Type: application/json` when `init.body` is present — bodyless POST/PATCH requests must NOT send Content-Type or Fastify's JSON parser rejects the empty body with 400
- When adding a new API function with no request body, omit the body entirely — do NOT pass `body: JSON.stringify({})` as a workaround
- `UserRole` type derived from `AdminUserRowSchema.shape.role` — single source of truth for role enum

## Image Loading

- All thumbnail and below-the-fold `<img>` elements must have `loading="lazy"`
- Hero/displayed photos and lightbox images must NOT have `loading="lazy"` (above-the-fold, causes visible pop-in)
- `collection/lib/format-date.ts` — shared `formatRelativeDate` utility for collection components. Domain-scoped pure utilities in `collection/lib/` parallel `catalog/lib/`

## Photo Domains (Web UI)

- Catalog photo gallery on item detail page — shared, visible to all users
- Photo upload UI (Phase 1.9) requires `curator` role — show/hide upload controls based on user role
- Collection photo management (Phase 1.6) — private per-item photos, any authenticated user. `CollectionPhotoSheet` in `collection/photos/` reuses catalog `DropZone`, `UploadQueue`, and `PhotoGrid` directly
- `CollectionPhotoSchema` (base) and `PhotoSchema` are structurally identical (`{ id, url, caption, is_primary, sort_order }`). `CollectionPhotoListSchema` extends the base with `contribution_status: z.enum(['pending', 'approved', 'rejected']).nullable()` — only the list endpoint returns this field (via LEFT JOIN on `photo_contributions`). CRUD responses (upload, set-primary, reorder) use the base schema.
- PhotoGrid accepts `Array<Photo & { contribution_status?: string | null }>` — backward compatible with catalog `Photo[]`. Optional `onContribute?: (photoId: string) => void` prop renders Share2 icon (when status is null/rejected) and "Submitted"/"Shared" badges (when pending/approved). Catalog callers omit `onContribute`.
- `ContributeDialog` in `collection/photos/` — consent dialog with disclaimer, checkbox, amber submit, and an **intent radio** (`training_only` | `catalog_and_training`, default `training_only`). Callback pattern: `onConfirm: (intent: ContributeIntent) => void` — the dialog holds intent as internal state, parent (`CollectionPhotoSheet`) owns the mutation and calls `contributeMutation.mutate({ photoId, intent })`. Dialog title is neutral ("Contribute Photo"), button label is dynamic ("Contribute to Training" vs "Contribute to Catalog"). See Phase 1.6 amendment #148 and `docs/plans/Photo_Contribution_Visibility_Plan.md`.
- `AddToCollectionDialog` (when `photoFile` is provided) uses a **3-state radio** `'none' | 'training_only' | 'catalog_and_training'`. `'none'` is a **client-side sentinel only** — when the user keeps "Don't contribute" selected the contribute API is never called; the API contract strictly accepts `'training_only' | 'catalog_and_training'`. Default is `'training_only'` (the catalog is curated — every contribution trains the model regardless of intent; `catalog_and_training` is a superset that adds public catalog visibility on top of the same training donation, not an alternative to it). Toggling "Save this photo" off hides the radio and resets intent to the default.
- Shared contribution constants live in `collection/photos/consent.ts`: `CONSENT_VERSION`, `DEFAULT_CONTRIBUTE_INTENT`, `LICENSE_GRANT_TEXT`. Both `ContributeDialog` and `AddToCollectionDialog` import from here. NEVER re-declare these constants in a component — legal text and privacy defaults must never drift between surfaces.
- Server-side visibility derivation (API route): `intent === 'catalog_and_training' ? 'public' : 'training_only'`. This mapping is computed in `api/src/collection/photos/routes.ts` and passed to `insertPendingCatalogPhoto`, which MUST include `visibility` in its INSERT column list (the DB default is `'public'`, which is the wrong default for contributed photos — see the latent-bug finding captured in the amendment plan).
- ML training data exporter must NOT filter on `item_photos.visibility` — training_only photos must feed the training set. The `PHOTO_JOIN` constant in `api/src/catalog/ml-export/queries.ts` is `export`ed specifically so `queries.test.ts` can assert the absence of any visibility filter as a regression guard.
- `CollectionPhotoSheet` fetches its own photo list via `listCollectionPhotos()` on open (unlike catalog `PhotoManagementSheet` which receives `photos` as a prop). Uses `contributeTarget: string | null` state mirroring the `deleteTarget` pattern.
- `thumbnail_url` in collection list uses `COALESCE(collection_primary.url, catalog_primary.url)` — user's own photo takes priority. Both URL formats work with `buildPhotoUrl()` (relative paths under same `PHOTO_BASE_URL`)
- `collection_photo_count` on `CollectionItem` drives the Camera button badge. Correlated subquery, RLS-safe (scoped through parent `collection_items` JOIN)
- `onManagePhotos` prop threads through `CollectionPage` → `CollectionGrid`/`CollectionTable` → `CollectionItemCard`/rows → opens `CollectionPhotoSheet` via `photoTarget` state
- Photo URLs are stored as relative paths in the DB (e.g., `abc-123/def-456-original.webp`) — `buildPhotoUrl()` from `catalog/photos/api.ts` prepends `VITE_PHOTO_BASE_URL` for display
- `VITE_PHOTO_BASE_URL` defaults to `http://localhost:3010/photos` in dev (matches `@fastify/static` route)
- `buildHeaders()` in `api-client.ts` skips `Content-Type: application/json` when `body instanceof FormData` — required for multipart uploads
- Photo upload uses XHR (not `fetch`) for `upload.onprogress` — the XHR wrapper in `catalog/photos/api.ts` manages its own auth header via `authStore.getToken()` and retries once on 401
- Photo management UI lives in `src/catalog/photos/` — Sheet component, DropZone, PhotoGrid, hooks, API functions
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` for drag-to-reorder in PhotoGrid
- `@dnd-kit/sortable` `useSortable` returns `attributes` that include `aria-roledescription` — do NOT set this prop explicitly on the drag surface element or TypeScript will error with TS2783 (duplicate prop)
- PhotoGrid cards are draggable by the entire tile (not a small grip handle) — `attributes` and `listeners` are on the outer `div`, with `pointer-events-none` on the `<img>` to prevent browser default image drag. The `PointerSensor` `distance: 5` constraint lets clicks on star/delete buttons resolve without triggering a drag.
- `DuplicateUploadError` in `catalog/photos/api.ts` — thrown when XHR gets 409 from photo upload (perceptual duplicate detected). Caught in `usePhotoUpload.ts` for a specific toast message distinct from generic upload errors.

## Collection Module (Phase 1.8+)

- Collection domain lives in `src/collection/` — parallel to `catalog/`, `admin/`, `auth/`
- `collection/api.ts` — 7 API functions consuming `/collection` endpoints
- Query keys: `['collection', 'items', filters]`, `['collection', 'stats']`, `['collection', 'check', itemIds]` — all mutations invalidate the `['collection']` prefix
- `useCollectionCheck(itemIds)` is lazy (`enabled: itemIds.length > 0`) — callers MUST memoize `itemIds` with `useMemo` to prevent infinite refetch loops
- `ConditionSelector` (package condition), `ItemConditionSelector` (C-grade 1-10), and `NotesField` are shared components in `collection/components/` — used by both `AddToCollectionDialog` and `EditCollectionItemDialog`
- **Parallel renderers must share their composed elements.** When two components render the same logical UI element for different layout contexts (e.g., a Grid card vs. a Table row of the same data), extract the shared element into a single component imported by both. Parallel renderers silently drift when features are added to one path but not the other. **Historical example:** `CollectionItemCard` (Grid) and `CollectionTable` (Table) both rendered the same View / Edit / Manage Photos action row. When the photo-count badge was added to the Card, the Table view silently lost it. Fixed by extracting `<CollectionItemActions>` (`collection/components/CollectionItemActions.tsx`). Look for this pattern any time you find yourself copy-pasting JSX between two components — copy-paste between Card and Table is the strongest signal. The rule generalizes: any time you have N>1 layouts of the same data (Grid/Table/List/Compact), the per-item action chrome belongs in a shared component, not duplicated per layout.
- `ConditionBadge` uses collector short codes (MISB, OC, LC, etc.) from `collection/lib/condition-config.ts`; `ItemConditionBadge` uses C-grade labels (C1-C10) from `collection/lib/item-condition-config.ts`
- Amber accent (`amber-600`/`amber-400`) differentiates collection UI from catalog's blue/purple
- Soft-delete uses undo toast (Sonner action button, 8s duration), NOT confirmation dialog
- `buildPhotoUrl` lives in `lib/photo-url.ts` but the documented import path is `@/catalog/photos/api` (re-export) — use the re-export for convention consistency
- Adding `useCollectionCheck` or `useCollectionMutations` to a component requires adding mocks to every test file that renders that component — search for `vi.mock.*useCollectionCheck` to find existing mock patterns
- Export/import: `useCollectionExport` (useState-based, blob download + toast), `useCollectionImport` (useMutation with `['collection']` invalidation), `ImportCollectionDialog` (5-phase state machine: idle -> file-selected -> importing -> complete -> error)
- Export/import round-trip safety: client `importCollection` must strip fields the import endpoint doesn't accept (`exported_at`, item `deleted_at`) — Fastify's `additionalProperties: false` rejects unknown properties with 400
- `downloadJsonBlob` in `collection/lib/download.ts` — shared blob download utility used by export hook and retry-file download
- Route tree regeneration: `npx tsr generate` does not work standalone — use `npm run build` or `npm run dev` to trigger the TanStack Router Vite plugin
- `CatalogItemDetailSchema` extends `CatalogItemSchema` — any field added to the base schema MUST also be added to the API's `itemDetail` Fastify schema in `api/src/catalog/items/schemas.ts` (which is hand-written, not derived from `itemListItem`)
- `ItemListItem` interface in `ItemList.tsx` uses optional `thumbnail_url?` — search results may not include it, so the field must be optional to avoid breaking the SearchPage

## ML Photo Identification (Phase 4.0c-2)

- ML service layer lives in `src/ml/` — framework-agnostic, no React imports. Handles model caching (IndexedDB), image preprocessing (canvas 224x224 + ImageNet normalization), ONNX inference (onnxruntime-web), and label parsing
- `onnxruntime-web` is dynamically imported in `image-classifier.ts` to keep it out of the main bundle (~394KB JS + WASM loaded on demand)
- WASM files served from jsDelivr CDN — configured via `ort.env.wasm.wasmPaths` in `image-classifier.ts`
- ONNX models use `.onnx` graph + `.onnx.data` sidecar pattern — both must be downloaded and passed via `externalData` option to `InferenceSession.create()`
- IndexedDB cache: DB `trackem-ml-models`, store `model-binaries`, keyPath `name`. Stores graph bytes, data bytes, label map, and version. Cache hit = version match
- `AddByPhotoSheet` on the collection page — "Add by Photo" button opens a modal sheet with photo drop zone, model download progress, and top-5 prediction cards
- `PredictionCard` eagerly fetches item detail via `useItemDetail` and collection check via `useCollectionCheck` — enables inline "Add to Collection" button per prediction
- Primary model loads by default; "Try alt-mode" button switches to secondary model without re-uploading the photo
- Model metadata via `useMlModels` hook consuming `GET /ml/models` (staleTime: 5 min)
- `softmax` is always applied to model output (never conditionally) — ensures confidence values sum to 1
- Query key: `['ml', 'models']`

## ML Telemetry (Phase 4.0c-T)

- `emitMlEvent` in `src/ml/telemetry.ts` — fire-and-forget, uses plain `fetch` with manual auth header (NOT `apiFetch` — avoids never-resolving promise on expired sessions)
- Returns `void` (not `Promise<void>`) to prevent accidental awaiting
- `usePhotoIdentify` emits `scan_started`, `scan_completed`, `scan_failed`
- `AddByPhotoSheet` emits `scan_abandoned` (on sheet close without terminal event) and `browse_catalog`
- `PredictionCard` emits `prediction_accepted` via `AddToCollectionDialog`'s `onSuccess` callback
- Terminal event tracking: `hasTerminalEventRef` prevents double-counting abandonment when `prediction_accepted` or `browse_catalog` already fired
- Admin dashboard at `/admin/ml` — stat cards + recharts line/bar charts, `days` selector (7/30/90) via URL search params
- Model quality section below telemetry: `ModelQualitySection` -> `ModelComparisonCards` + `PerClassAccuracyChart` + `ConfusedPairsTable`. Data from `GET /ml/stats/model-quality` (filesystem-backed, staleTime: 5 min)
- `formatClassLabel` in `admin/ml/format-utils.ts` — converts `franchise__item-slug` to title-cased "Item Name" for chart labels
- `PerClassAccuracyChart` shows first 30 classes with "Show all" toggle — color-coded bars (green >=70%, amber >=50%, red <50%)
- recharts mock pattern for jsdom tests: mock `ResponsiveContainer`, `LineChart`, `BarChart` etc. as plain divs

## onnxruntime-web Integration

- Default Vite ESM import resolves to `ort.bundle.min.mjs` (~394KB) — no Vite config changes needed for WASM
- Set `ort.env.wasm.wasmPaths` to CDN URL before first `InferenceSession.create()` — WASM files are not bundled
- ONNX models may use `.onnx` + `.onnx.data` sidecar pattern — pass sidecar via `externalData: [{ path, data }]` to `InferenceSession.create()`
- Dynamic import (`await import('onnxruntime-web')`) keeps the runtime out of the main bundle — use inside function bodies, not at module top level
- jsdom does not implement `createImageBitmap` or `OffscreenCanvas` — canvas-based preprocessing must live in a separate module so tests can mock it via `vi.mock`
- `vi.mock` cannot partially mock a module's own internal function calls — if `classifyImage` calls `preprocessImage` in the same file, the mock won't intercept it. Extract to a separate module.

## Catalog Browsing (Phase 1.7+)

- Catalog pages live in `src/catalog/` with `api.ts`, `hooks/`, `components/`, `pages/` sub-directories
- Route files under `src/routes/_authenticated/catalog/` — directory-based nesting, no layout route (each page renders AppHeader + MainNav)
- `MainNav` component (`src/components/MainNav.tsx`) renders on all non-admin pages — when adding it to a page, update that page's test file to mock `useRouterState` in the `@tanstack/react-router` mock
- URL search params drive all catalog filter/pagination state — `useMemo` the filters object to prevent TanStack Query key instability
- Item detail sheet reads `selected` slug from URL, fetches independently via `useItemDetail`
- Character and item detail pages share content components (`ItemDetailContent`, `CharacterDetailContent`) between sheet overlays and standalone pages
- TanStack Router: a flat route file (e.g., `items.tsx`) becomes a layout parent if a child directory (`items/`) is added alongside it. To add child routes without a layout, move the flat file to `items/index.tsx` first — both become flat siblings under `AuthenticatedRoute`. The `createFileRoute` path gains a trailing slash for index files (e.g., `'/_authenticated/catalog/$franchise/items/'`)
- Item detail route uses directory structure: `$franchise/items/index.tsx` (browse) + `$franchise/items/$slug.tsx` (detail) — NOT a layout route
- Character browse route: `$franchise/characters/index.tsx` (browse with faceted filters) + `$franchise/characters/$slug.tsx` (detail) — same directory structure as items
- Browse pages (Items, Characters, Manufacturer Items) use two-column layout (FacetSidebar | List) with a non-modal Sheet overlay for details; Search uses single column + Sheet
- Character facets: faction, character_type, sub_group — continuity_family is a fixed scope filter (set from hub navigation), not a facet dimension
- Franchise hub page has Items/Characters toggle via `?view=characters` search param; characters view mounts `CharactersHubView` sub-component (avoids conditional hook calls)
- Photo gallery uses a two-level interaction: thumbnails change the displayed photo in-page (`selectedIndex`), clicking the displayed photo opens the lightbox (`lightboxIndex`). Lightbox navigation wraps around (last->first, first->last)
- Photo gallery sorts photos client-side as `is_primary DESC, sort_order ASC` (matching the API query) — sorting by `sort_order` alone causes primary photo to appear out of position after set-primary mutations
- All photo displays use `object-contain` (never `object-cover`) — no cropping of images in gallery, thumbnails, or photo manager tiles
- **Tall dialogs must scroll**: any `DialogContent` whose body can exceed the viewport (e.g., conditional sections, long forms with many fields, photo previews) MUST include `max-h-[90vh] overflow-y-auto` on the className. The shadcn `DialogContent` primitive has no built-in scroll wrapper — tall content overflows the fixed-position dialog and the submit button in the footer becomes unreachable. Caught by Playwright's 1280×720 viewport, missed by manual testing on taller browser windows. Examples that have this: `AddToCollectionDialog`, `EditCollectionItemDialog`, `ImportCollectionDialog`, `ContributeDialog`. The shadcn `AlertDialogContent` primitive does NOT need this — confirmation dialogs are inherently short.
- Photo lightbox uses Shadcn `Dialog` for focus trap, scroll lock, and ARIA modal compliance — must include `onKeyDown` for ArrowLeft/ArrowRight navigation
- Displayed photo has a `ZoomIn` magnifying glass icon overlay (bottom-right, opacity transitions on hover via `group`/`group-hover`)
- Gallery main image is constrained to `max-h-[32rem]` (512px); photo manager tiles are constrained to `max-h-48`
- `DetailSheet` component handles all detail overlay chrome (non-modal Sheet, loading/error states, header with title + actions + close button) — `ItemDetailSheet` and `CharacterDetailSheet` compose it. Uses `SheetPortal` + `SheetPrimitive.Content` directly (bypasses `SheetContent` to omit `SheetOverlay` for non-modal behavior). Width: `sm:max-w-3xl` (768px).
- Detail sheets use `modal={false}` on Radix Dialog — no focus trap, no backdrop overlay, list behind is interactive. Escape key is handled by Radix built-in (fires `onOpenChange(false)`). The `aria-label` on `SheetPrimitive.Content` provides the accessible name for E2E selectors (`getByRole('dialog', { name: /Item detail/ })`).
- Catalog page headings use `<h1>` for the primary page title, `<h2>` for sub-sections — no page should lack an `<h1>`
- NEVER use `z.coerce.boolean()` for URL search params — `Boolean("false")` returns `true`. Use `z.enum(['true', 'false']).transform(v => v === 'true')` instead
- `FacetSidebar` accepts generic `groups: FacetGroupConfig[]` + `onFilterChange: (key: string, value) => void` — callers construct the groups array and cast the key to their filter type. Do NOT add domain-specific filter types to FacetSidebar.
- Manufacturer browsing pages live in `src/catalog/pages/Manufacturer*.tsx` with hooks in `src/catalog/hooks/useManufacturer*.ts`
- Manufacturer routes: `/catalog/manufacturers` (list), `/catalog/manufacturers/:slug` (hub), `/catalog/manufacturers/:slug/items` (items browse with filters in search params)
- All paginated pages use page/offset pagination (`Pagination` component in `catalog/components/Pagination.tsx`) with `PageSizeSelector` (20/50/100 per page). Shared constants: `DEFAULT_PAGE_LIMIT`, `pageLimitSchema`, `PAGE_LIMIT_OPTIONS` in `lib/pagination-constants.ts`. Catalog and collection use `enum: [20, 50, 100]` limit validation; search uses `min: 1, max: 100`.
- Domain-scoped pure utilities (no React imports) live in `src/catalog/lib/` — e.g., `relationship-utils.ts` for grouping/formatting logic. Keep these independently unit-testable.
- `RelationshipSection` supports `isCurrent?: boolean` on items (renders as non-interactive `<span>` with `aria-current="true"`) and `renderHeading?: () => ReactNode` on groups (renders custom heading, e.g., a `<Link>`). Both are optional — `ItemRelationships` does not use them.

## Catalog Component Tests

- Shared test fixtures: `src/catalog/__tests__/catalog-test-helpers.tsx` — typed mock data for all catalog Zod types + `createCatalogTestWrapper()`. Update there when schemas change, not per-test file.
- Page tests must mock `AppHeader` and `MainNav` — `AppHeader` calls `useAuth()` which throws without `AuthContext`. Use: `vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header data-testid="app-header" /> }))`
- `FranchiseListPage`, `ManufacturerListPage`, `ManufacturerHubPage` do NOT import route files — no `Route.useSearch()` mock needed for these
- `CharacterDetailPage` uses inline `useQuery` (not a custom hook) for related items — mock `listCatalogItems` from `@/catalog/api` and wrap in `createCatalogTestWrapper()`
- Adding `useAuth()` to a component requires adding `vi.mock('@/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u-1', role: 'user' }, isAuthenticated: true, isLoading: false }) }))` to every test file that renders that component
- Page tests that render `ItemDetailSheet` or `CharacterDetailSheet` mock the entire sheet component to `null` — this avoids needing QueryClient, collection, and auth mocks in page-level tests. The sheet's own test file handles those mocks.
- `vi.advanceTimersByTime()` must be wrapped in `act()` when it triggers React state updates (e.g., `ShareLinkButton` timeout reset)
- jsdom does not implement `navigator.clipboard` — mock with `Object.assign(navigator, { clipboard: { writeText: vi.fn() } })`
- jsdom does not implement `File.prototype.text()` or `Blob.prototype.text()` — use `FileReader` wrapped in a `Promise` instead of the modern `file.text()` API
- TanStack Query `mutationFn: myFunction` direct reference: TanStack calls `myFunction(variables, mutationContext)` with two args — use `vi.mocked(fn).mock.calls[0]?.[0]` to assert only the first arg, not `toHaveBeenCalledWith(payload)`
- Integration components that own their own fetch (e.g., `CharacterRelationships`, `ItemRelationships`) require `vi.mock` in parent component tests — otherwise the hook fires without a QueryClient and crashes. Mock pattern: `vi.mock('@/catalog/components/CharacterRelationships', () => ({ CharacterRelationships: () => null }))`
