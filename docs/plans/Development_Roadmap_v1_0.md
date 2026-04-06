# Track'em Toys — Development Roadmap v1.0

**Created:** 2026-03-16
**Status:** Draft
**Source:** Requirements Document v1.0 (2026-02-22)
**Strategy:** ML-Accelerated, Web-First

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [ML-Accelerated Phase Structure](#3-ml-accelerated-phase-structure)
4. [Dependency Graph](#4-dependency-graph)
5. [Deferred Phases](#5-deferred-phases)
6. [GitHub Project Tracking Strategy](#6-github-project-tracking-strategy)
7. [Issue Migration Plan](#7-issue-migration-plan)
8. [Proposed New Issues](#8-proposed-new-issues)
9. [Recommended Work Order](#9-recommended-work-order)

---

## 1. Executive Summary

The project has completed its authentication foundation (Phases 1.1–1.3) and is partway through catalog schema and seed data work (Phase 1.4). This roadmap prioritizes getting to **ML-based photo identification as fast as possible** using a web-first approach.

**Strategy:** Build the shortest path from current state to ML training — Catalog API → Photo Upload (web) → ML Training Pipeline (macOS) → iOS App with On-Device Inference. All collection management features (private items, pricing, tags, CSV import, reporting) are **deferred until after ML is functional**.

**Rationale:** The `item_photos` table already has a direct FK to `items` (shared catalog). Catalog photos are **centrally managed app content** (reference images of items), not user-contributed personal photos. They are shared across all users and feed ML training directly — no RLS or consent mechanism needed. User's personal collection photos (private, per-item condition shots) come later with collection items. This cuts the path to ML from ~8 sub-phases to 4 active phases.

**Key decisions:**

- **OAuth-only authentication** — email/password auth (requirements doc item 5) is not needed; Apple + Google OAuth2 is sufficient
- **Two photo domains** — Catalog photos (shared, app-managed, ML training data) vs. user collection photos (private, deferred to post-ML)
- **No ML consent needed for catalog photos** — they are centrally managed app content, not user PII
- **Personal collection photos are private** — deferred to post-ML; will use RLS when built
- **GDPR account deletion** — endpoint and PII scrubbing logic included in the roadmap
- **User roles (hybrid admin)** — `role` column on users ('user', 'curator', 'admin'); admin routes in same app, code-split; can extract to separate app later if needed

**Key numbers:**

- **Completed:** 3 sub-phases, 13 migrations, 562 tests (490 API + 72 web)
- **In progress:** Seed ingestion pipeline (#30, #31)
- **Active phases to ML:** 4 (1.4 Seed → 1.5 Catalog API → 1.9 Photos → 4.0 ML)
- **Deferred until post-ML:** Collection API, Collection UI, CSV Import, Reporting, Pricing

---

## 2. Current State Assessment

### What's Built

| Area                        | Status | Details                                                                                                                                                         |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB Auth Schema (001–010)    | DONE   | users, oauth_accounts, refresh_tokens, auth_events, RLS context                                                                                                 |
| DB Catalog Schema (011–013) | DONE   | factions, sub_groups, characters, character_sub_groups, manufacturers, toy_lines, items, item_photos, catalog_edits, continuity_families, character_appearances |
| API Authentication          | DONE   | OAuth2 Apple/Google, ES256 JWT, token rotation, reuse detection, 490 tests                                                                                      |
| Web SPA Authentication      | DONE   | Login/logout, silent refresh, protected routes, account linking, 72 tests                                                                                       |
| Seed JSON Files             | DONE   | 438 characters (10 files), 118 FansToys items, 10 continuity families, 11 factions, 52 sub_groups, 3 manufacturers, 4 toy_lines                                 |
| Seed Validation Tests       | DONE   | 121 tests in `seed-validation.test.ts`                                                                                                                          |
| API Documentation           | DONE   | Swagger + Scalar at `/docs`                                                                                                                                     |
| Apple Webhooks              | DONE   | Server-to-server notification endpoint                                                                                                                          |

### What's on the Critical Path to ML

| Area                          | Status            | Blocking?                                                                     |
| ----------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| Seed Ingestion Script         | NOT STARTED (#30) | Yes — blocks catalog API                                                      |
| Seed Integration Tests        | NOT STARTED (#31) | Yes — validates ingestion                                                     |
| Catalog API Routes            | NOT STARTED       | Blocked by seed ingestion                                                     |
| Web Catalog UI                | NOT STARTED       | Blocked by catalog API                                                        |
| Photo Upload API + UI         | NOT STARTED       | Schema exists (`item_photos`), no app code                                    |
| ML Training Pipeline          | 4.0a–d DONE       | Full pipeline complete: training, serving, telemetry, quality dashboard, docs |
| iOS App + On-Device Inference | NOT STARTED       | Blocked by trained model                                                      |

### What's Deferred (Post-ML)

| Area                                  | Original Phase | Why Deferred                                                         |
| ------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Collection Items (private, RLS)       | 1.6            | ML needs catalog photos, not private collections                     |
| User Collection Photos (private, RLS) | 1.6+           | Personal condition/shelf photos; separate from shared catalog photos |
| Price Records                         | 1.6            | No ML dependency                                                     |
| Tags / Item Tags                      | 1.6            | No ML dependency                                                     |
| Web Collection UI                     | 1.8            | Depends on deferred collection API                                   |
| CSV Import                            | 1.10           | No ML dependency                                                     |
| Basic Reporting                       | 1.11           | No ML dependency                                                     |
| Pricing Integration                   | 3.0            | No ML dependency                                                     |

---

## 3. ML-Accelerated Phase Structure

### Phase 1.1: Database Foundation — DONE

### Phase 1.2: API Authentication — DONE

### Phase 1.3: Web SPA Authentication — DONE

---

### Phase 1.4: Catalog Schema & Seed Data — IN PROGRESS

**Done:**

- Migrations 011–013 (shared catalog tables with UUID PKs + slug columns)
- Seed JSON files (438 characters, reference data, FansToys items)
- Seed validation tests (121 passing)

**Remaining:**

| Issue | Title                      | Priority | Notes                                                                                           |
| ----- | -------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| #30   | Seed ingestion script      | CRITICAL | Slug-to-UUID resolution, two-pass character insert for combiner self-references                 |
| #31   | Seed integration tests     | CRITICAL | Verify seeded data in real DB                                                                   |
| #25   | Character appearances seed | Medium   | Sprint 1 stretch goal — use research agent (#28) to populate; include in ingestion script (#30) |
| #26   | Comic book character seed  | Low      | Data expansion                                                                                  |
| #27   | Mold relationship tracking | Medium   | Needs design spike; can defer to 1.5                                                            |

---

### Phase 1.5: Catalog API Routes (Read-Only)

**Depends on:** Phase 1.4 seed ingestion complete

Read-only REST API for the shared catalog. No auth required for reads.

**Endpoints:**

| Method | Path                           | Description                                                     |
| ------ | ------------------------------ | --------------------------------------------------------------- |
| GET    | `/catalog/characters`          | List with pagination, filter by faction/continuity_family/type  |
| GET    | `/catalog/characters/:slug`    | Detail with sub_groups, combiner info                           |
| GET    | `/catalog/items`               | List with pagination, filter by manufacturer/toy_line/character |
| GET    | `/catalog/items/:slug`         | Detail with manufacturer, character, toy_line joins             |
| GET    | `/catalog/manufacturers`       | List all                                                        |
| GET    | `/catalog/manufacturers/:slug` | Detail with toy_lines                                           |
| GET    | `/catalog/toy-lines`           | List with filter by manufacturer                                |
| GET    | `/catalog/toy-lines/:slug`     | Detail with items                                               |
| GET    | `/catalog/factions`            | Reference data                                                  |
| GET    | `/catalog/sub-groups`          | Reference data                                                  |
| GET    | `/catalog/continuity-families` | Reference data                                                  |
| GET    | `/catalog/search?q=`           | Full-text search across characters + items                      |

**New files:**

- `api/src/catalog/routes.ts` — Fastify route plugin
- `api/src/catalog/schemas.ts` — JSON Schema for request/response validation
- `api/src/catalog/queries.ts` — DB queries with explicit column lists
- `api/src/catalog/routes.test.ts` — Integration tests via `fastify.inject()`

**New migration:**

- Migration 014: GIN indexes on `tsvector` for full-text search on characters.name + items.name

---

### Phase 1.5b: User Roles & Admin Foundation

**Depends on:** Phase 1.3 (auth complete) — should complete before Phase 1.9 (photo upload needs curator role)

**Decision:** Hybrid approach (Option 3) — role column + admin routes in same web app, code-split. Can extract to a separate admin app later if security requirements tighten. Chosen over a separate admin app because this is currently a personal/small-team tool, not a public SaaS.

**Migration 019** (add role column) + **Migration 020** (admin audit event types):

```sql
-- 019
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'curator', 'admin'));
-- No index: low-cardinality column on small table

-- 020: extends auth_events.event_type CHECK constraint
-- Adds: role_changed, account_reactivated, user_purged
```

**Roles:**

| Role      | Capabilities                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `user`    | Browse catalog, manage own collection (post-ML), view own photos                                                               |
| `curator` | All user powers + upload/edit/delete catalog items, characters, manufacturers, toy_lines, catalog photos, review catalog_edits |
| `admin`   | All curator powers + user management (view users, change roles, deactivate/delete accounts), system settings                   |

**API changes:**

- `requireRole(role)` Fastify preHandler hook — checks JWT claims for role, returns 403 if insufficient
- Include `role` in JWT access token claims (avoids DB lookup on every request)
- Include `role` in `/auth/me` response and `UserResponse` type
- Catalog write routes (POST/PUT/DELETE) require `curator` or `admin`
- User management routes (GET /admin/users, PUT /admin/users/:id/role) require `admin`

**Web changes:**

- Admin section under `/admin/*` routes — code-split via lazy import
- Role-aware navigation: curators see "Manage Catalog" link, admins see "Admin" section
- Admin pages: user list, role assignment, catalog edit review queue
- Route guard: `requireRole` check in TanStack Router `beforeLoad`

**Seed/bootstrap:**

- First user (project owner) is set to `admin` via CLI command or seed script
- `npx trackem set-role <email> admin` utility command

**New files:**

- `api/src/auth/role.ts` — Role hierarchy, `requireRole()` factory, `isRolePayload()` guard
- `api/src/auth/role.test.ts` — Unit tests for role utilities
- `api/src/admin/routes.ts` — Admin-only routes (user management)
- `api/src/admin/queries.ts` — Admin-specific DB queries
- `api/src/admin/schemas.ts` — Fastify route schemas for admin routes
- `api/src/admin/routes.test.ts` — Integration tests (role enforcement, 403 scenarios)
- `api/scripts/set-role.ts` — CLI for bootstrapping first admin user
- `web/src/routes/admin/` — Admin pages (lazy-loaded) — **deferred to separate issue**

**Architecture decision record:** See `docs/decisions/ADR_User_Roles_Admin.md` for full design details, guards, GDPR purge sequence, and audit logging strategy.

---

### Phase 1.7: Web Catalog Browsing UI

**Depends on:** Phase 1.5 (catalog API routes)

Replace placeholder dashboard with real catalog browser.

**Pages/Components:**

- Catalog browser: grid/list toggle, sidebar filters (faction, continuity family, manufacturer, toy line), pagination
- Character detail page: bio, sub_groups, combined forms, related items
- Item detail page: photos (from item_photos), manufacturer, character, toy_line
- Manufacturer detail page: info, toy_lines, items
- Global search bar with instant results

**New TanStack Router routes:** `/catalog`, `/catalog/characters/:slug`, `/catalog/items/:slug`, `/catalog/manufacturers/:slug`

---

### Phase 1.9: Photo Management (Centrally Managed Catalog Photos)

**Depends on:** Phase 1.5 (catalog API provides item context) + Phase 1.5b (curator role for upload authorization)

**Key change from original roadmap:** Photos attach to **shared catalog items** via the existing `item_photos` table (migration 011), not private collection items. This removes the dependency on collection schema (Phase 1.6) entirely.

**Photo model:** Catalog photos are **centrally managed app content** — reference images of items (product shots, box art, alternate angles). They are shared across all users and visible to anyone browsing the catalog. The `uploaded_by` column tracks who contributed the photo for attribution, but photos are not private. No RLS is needed on `item_photos`.

User's **personal collection photos** (condition shots of their own items) are a separate concern, deferred to post-ML with the collection schema. Those will be private with RLS.

**Features:**

- Storage strategy decision: local filesystem vs S3-compatible
- Upload API: `POST /catalog/items/:slug/photos` (multipart/form-data, requires `curator` role — contributor tracked via `uploaded_by`)
- Thumbnail generation with `sharp` (multiple resolutions for web gallery + ML training export)
- Primary photo selection (one primary per item, existing unique index)
- Photo gallery component on item detail page (all catalog photos visible to all users)
- Photo type classification (front, back, box art, accessory, etc.)
- **ML training export:** Endpoint or script to export catalog photos organized by character/item class into folder structure compatible with Create ML

**New files:**

- `api/src/catalog/photos/routes.ts` — Photo upload/management routes
- `api/src/catalog/photos/storage.ts` — Storage abstraction (local/S3)
- `api/src/catalog/photos/thumbnails.ts` — Thumbnail generation with sharp
- `api/src/catalog/photos/routes.test.ts` — Integration tests

---

### Phase 1.9b: Photo Enhancements (Post-ML)

**Depends on:** Phase 1.9 (photo system must exist) + Phase 4.0 (ML pipeline proves the photo system works before investing in enhancements)

Post-ML enhancements to the photo management system. These are not needed for ML training but improve the curator and user experience once the core photo workflow is validated.

**Issues:**

| Issue | Title                                               | Priority | Effort |
| ----- | --------------------------------------------------- | -------- | ------ |
| #71   | Photo moderation: NSFW detection + approval         | High     | L      |
| #72   | Approval notification dashboard                     | Medium   | M      |
| #73   | Soft delete + 30-day recycle bin                    | Medium   | M      |
| #74   | Caption editing                                     | Low      | S      |
| #75   | Pending photo visibility (uploader-only with badge) | Medium   | M      |

---

### Phase 4.0: ML Training Pipeline

**Depends on:** Phase 1.9 (sufficient photos uploaded — ~80-200 per target class)

Train image classification models using the collector's own catalog photos.

**Sub-phases:**

#### 4.0a: Training Data Preparation — DONE

- ✅ Export script with two input modes: API manifest (`--manifest`) and directory scan (`--source-dir`)
- ✅ Data augmentation: 15 deterministic transforms (flip, rotation ±10°, brightness ±20%, compounds)
- ✅ Class balance analysis with adaptive augmentation (target count per class, default 100)
- ✅ Seed-images directory structure: `{tier}/{franchise}/{manufacturer}/{item}/` with category-based tiers (`training-primary`, `training-secondary`, `training-package`, `training-accessories` + matching `test-*` tiers)
- ✅ Output validation: Create ML format, minimum 10 images per class, clean-on-rerun
- ✅ 87 unit tests across 7 test files

#### 4.0b: Model Training — DONE

- ✅ PyTorch MobileNetV3-Small with progressive unfreezing (2-phase training)
- ✅ Dual export: ONNX (web via onnxruntime-web) + Core ML (iOS)
- ✅ Cross-format validation script with accuracy gates (≥70%) and agreement gates (≥95%)
- ✅ Model evaluation: per-class accuracy, confusion matrix, top-3 accuracy in metrics JSON
- ✅ Model versioning: `{category}-classifier-{date}-c{N}-a{acc}` naming convention

#### 4.0c: Model Serving & Web Integration — DONE

- ✅ Model metadata API: `GET /ml/models` (auto-discovers models from filesystem)
- ✅ Client-side inference via onnxruntime-web with IndexedDB caching
- ✅ "Add by Photo" on collection page with top-5 predictions and inline add-to-collection
- ✅ ML inference telemetry: 6 event types, `POST /ml/events`, admin dashboard at `/admin/ml`
- ✅ Model quality dashboard: per-class accuracy chart, confused pairs table, quality gate badges
- ✅ E2E tests: 15 Playwright tests covering Add by Photo flow and admin ML stats
- Optional: server-side fallback `POST /ml/classify` (Phase 4.0c-3, not needed for current scale)

#### 4.0d: Retraining Pipeline Documentation — DONE

- ✅ End-to-end pipeline: prepare-data → train → export → validate → deploy
- ✅ Retraining triggers (new data, accuracy degradation, new classes)
- ✅ Quality gates checklist (7 items: 3 automated, 4 manual review)
- ✅ Deployment and rollback procedures
- ✅ Data versioning and CI/automation recommendations

---

### Phase 2.0: iOS App with On-Device Inference

**Depends on:** Phase 4.0b (trained Core ML model exists)

Build the iOS app with ML inference as a **first-class feature from day one**.

**Sub-phases:**

#### 2.0a: iOS App Scaffolding

- Swift 6, SwiftUI, SwiftData + CloudKit sync
- Authentication: reuse API auth (Apple/Google Sign-In)
- iOS CI/CD pipeline (#5)

#### 2.0b: Camera + ML Inference

- Camera integration for photo capture
- Vision Framework pre-filter: confirm photo contains toy/robot/action figure
- Core ML inference: load trained model, classify captured photo
- Display top-N predictions with confidence scores
- User confirms or corrects classification → feeds back into training data

#### 2.0c: Barcode Scanning

- AVFoundation barcode scanning (UPC-A, UPC-E, EAN-8, EAN-13)
- Barcode lookup against product databases
- Quick-add workflow: scan → snap → ML suggests identity → confirm → save

#### 2.0d: Offline & Sync

- Offline data entry with sync-on-reconnect
- Photo queue for upload when connectivity returns
- SwiftData local cache with CloudKit sync

---

### Phase 1.12: Account Security & GDPR Compliance

**Depends on:** Phase 1.3 (auth complete) — can be done in parallel with any other phase

This phase can be implemented at any point but **must ship before the app is user-facing**.

**GDPR Account Deletion (Requirements Doc 7b):**

- `DELETE /auth/account` endpoint (authenticated)
- PII scrubbing: set `email = 'deleted-<uuid>@deleted.local'`, `display_name = NULL`, `avatar_url = NULL`
- Set `deleted_at = NOW()` on users row (tombstone)
- Hard-delete: all `refresh_tokens`, `oauth_accounts` for the user
- Log `auth_event` with type `'account_deleted'`
- Revoke all active sessions
- Delete user's photos from storage (or queue for async deletion)
- Web UI: "Delete Account" button in account settings with confirmation dialog
- API returns 204 on success, clears auth cookies

**Implementation notes:**

- The `deleted_at` column already exists (migration 012)
- The `deactivated_at` column exists for soft-deactivation (different from deletion)
- Deletion is irreversible — confirmation dialog must be explicit ("Type DELETE to confirm")
- After deletion, any content previously attributed to the user shows "Deleted user"
- Photos owned by the deleted user are removed from storage; `item_photos` rows with `uploaded_by` = deleted user are hard-deleted (CASCADE or explicit delete before tombstone)

---

### Post-ML Phases (Collection & Pricing)

After ML identification is working, build out the collection management features:

#### Phase 1.6: Collection Schema & API (Private, Authenticated)

User's private collection CRUD with Row-Level Security.

**New migration (015):**

| Table              | Key Columns                                                                                                                | RLS                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `collection_items` | user_id, catalog_item_id (FK → items), condition, acquisition_date, acquisition_price, acquisition_source, notes, metadata | Yes — `(SELECT current_app_user_id())` |
| `price_records`    | collection_item_id (FK), price_type, amount, currency, source_platform, source_url, listing_date, is_sold                  | Yes — via collection_items join        |
| `tags`             | user_id, name, parent_id (self-ref for hierarchy), color                                                                   | Yes                                    |
| `item_tags`        | collection_item_id, tag_id                                                                                                 | Yes — via joins                        |

**Endpoints:**

| Method | Path                           | Description                                    |
| ------ | ------------------------------ | ---------------------------------------------- |
| POST   | `/collection/items`            | Add item to collection                         |
| GET    | `/collection/items`            | List user's collection with pagination/filters |
| GET    | `/collection/items/:id`        | Single collection item with catalog details    |
| PUT    | `/collection/items/:id`        | Update condition, notes, etc.                  |
| DELETE | `/collection/items/:id`        | Soft-delete                                    |
| POST   | `/collection/items/:id/prices` | Add price record                               |
| GET    | `/collection/items/:id/prices` | Price history for item                         |
| POST   | `/collection/tags`             | Create tag                                     |
| GET    | `/collection/tags`             | List user's tags                               |
| PUT    | `/collection/tags/:id`         | Update tag                                     |
| DELETE | `/collection/tags/:id`         | Delete tag                                     |
| PUT    | `/collection/items/:id/tags`   | Assign/remove tags                             |

#### Phase 1.8: Web Collection Management UI

- "Add to Collection" button/flow from catalog item detail
- Collection dashboard: total count, total value, recent additions
- Collection list view: filters, sort, inline edit, soft-delete
- Tag management: create, edit, delete, assign to items
- E2E tests for all collection flows

#### Phase 1.10: CSV Import

- Upload + parse API: `POST /collection/import/csv`
- Column mapping: user maps CSV headers to data model fields
- Preview/confirm step before bulk insert
- Progress indicator for large imports
- Error reporting for failed rows

#### Phase 1.11: Basic Reporting

- Collection summary API: count, total value, breakdown by franchise/toy_line
- Dashboard UI: summary cards, value trend chart, most valuable items, recent additions
- CSV/Excel export of full collection or filtered subsets

#### Phase 3.0: Pricing Integration

- eBay Browse API integration (TOS-compliant sold listing lookups)
- Amazon Product Advertising API (optional)
- Price history time-series and trend charts
- Collection valuation dashboard
- Insurance report PDF generation

#### Phase 5.0: Polish & Expansion

- Object detection for multi-figure scenes (Create ML Object Detection)
- Additional marketplace API integrations
- Community data features (if desired)
- Android app consideration
- Advanced reporting and analytics
- Auth hardening: CSRF Referer/Origin validation (#12), cleanup jobs (#11)

---

## 4. Dependency Graph

### ML-Accelerated Critical Path

```
1.1 (DB) ──> 1.2 (API Auth) ──> 1.3 (Web Auth)
                                      │
1.4 (Seed) ── IN PROGRESS ───────────┤
  │                                   │
  └──> 1.5 (Catalog API Read) ───────┤
         │                            │
         ├──> 1.5b (User Roles) ─────┤   ← Roles gate catalog writes + admin
         │         │                  │
         ├──> 1.7 (Web Catalog UI)   │
         │         │                  │
         └──────> 1.9 (Photo Upload) ┤   ← Requires curator role (1.5b)
                   │                  │     Catalog photos: shared, app-managed
                   └──> 4.0 (ML Training Pipeline)
                          │
                          └──> 2.0 (iOS App + On-Device Inference)
                                 │
                                 └──> POST-ML COLLECTION TRACK:
                                        1.6 → 1.8 → 1.10 → 1.11 → 3.0 → 5.0

1.12 (GDPR Account Deletion) ─── parallel, must ship before app is user-facing
```

### Critical Path (shortest to ML)

```
1.4 (finish seed) → 1.5 (catalog API) → 1.5b (roles) → 1.9 (photo upload) → 4.0 (ML training)
```

### Parallelizable Work

- **1.5b (Roles)** can start as soon as 1.3 is done — runs in parallel with 1.5
- **1.7 (Catalog UI)** can start as soon as 1.5 is done — runs in parallel with 1.5b and 1.9
- **1.12 (GDPR Deletion)** can be done at any time, independent of other phases
- **#25, #26** (seed data expansion) can happen anytime
- **#27** (mold relationships) can be done during 1.5
- **4.0a** (training data prep) can start as soon as first photos are uploaded

---

## 5. Deferred Phases

These features are deferred until after ML identification is functional. They are fully scoped but not scheduled.

| Phase              | Scope                                                              | Estimated Effort | Prerequisite  |
| ------------------ | ------------------------------------------------------------------ | ---------------- | ------------- |
| 1.6 Collection API | Private CRUD + RLS (4 tables, 12 endpoints)                        | L–XL             | ML functional |
| 1.6+ User Photos   | Private collection photos with RLS (condition shots, shelf photos) | L                | 1.6           |
| 1.8 Collection UI  | Dashboard, list, edit, tags (5 pages)                              | L–XL             | 1.6 + 1.7     |
| 1.10 CSV Import    | Upload, column mapping, preview, bulk insert                       | XL               | 1.6           |
| 1.11 Reporting     | Summary stats, charts, CSV export                                  | L                | 1.8           |
| 3.0 Pricing        | eBay API, price history, valuation, insurance PDF                  | XL               | 1.6           |
| 5.0 Polish         | Object detection, community, Android                               | XL               | All above     |

---

## 6. GitHub Project Tracking Strategy

### 6.1 Label Taxonomy

**Type labels** (what kind of work):

| Label          | Color                  | Description                    |
| -------------- | ---------------------- | ------------------------------ |
| `type:feature` | `#0E8A16` (green)      | New feature or capability      |
| `type:bug`     | `#d73a4a` (red)        | Something isn't working        |
| `type:chore`   | `#EDEDED` (gray)       | Maintenance, tooling, CI, deps |
| `type:test`    | `#BFD4F2` (light blue) | Test improvements or additions |
| `type:docs`    | `#0075ca` (blue)       | Documentation changes          |

**Module labels** (where the work is):

| Label    | Color                  | Description                    |
| -------- | ---------------------- | ------------------------------ |
| `api`    | `#0E8A16`              | Backend API changes (exists)   |
| `web`    | (exists)               | Web SPA changes (exists)       |
| `ios`    | (exists)               | iOS/macOS changes (exists)     |
| `db`     | `#D4C5F9` (lavender)   | Database migrations and schema |
| `ml`     | `#F9D0C4` (peach)      | ML pipeline changes            |
| `shared` | `#C2E0C6` (mint)       | Cross-module or monorepo-level |
| `infra`  | `#BFD4F2` (light blue) | CI/CD, tooling, deployment     |

**Phase labels** (ML-accelerated order):

| Label        | Color                | Description                       |
| ------------ | -------------------- | --------------------------------- |
| `phase:1.4`  | `#5319E7` (purple)   | Catalog Schema & Seed             |
| `phase:1.5`  | `#5319E7`            | Catalog API Routes                |
| `phase:1.5b` | `#5319E7`            | User Roles & Admin                |
| `phase:1.7`  | `#5319E7`            | Web Catalog UI                    |
| `phase:1.9`  | `#5319E7`            | Photo Management                  |
| `phase:1.12` | `#5319E7`            | Account Security & GDPR           |
| `phase:4.0`  | `#B60205` (dark red) | ML Training Pipeline              |
| `phase:2.0`  | `#1D76DB` (blue)     | iOS App + Inference               |
| `phase:1.6`  | `#5319E7`            | Collection Schema & API (post-ML) |
| `phase:1.8`  | `#5319E7`            | Web Collection UI (post-ML)       |
| `phase:1.10` | `#5319E7`            | CSV Import (post-ML)              |
| `phase:1.11` | `#5319E7`            | Basic Reporting (post-ML)         |
| `phase:3.0`  | `#006B75` (teal)     | Pricing Integration (post-ML)     |
| `phase:5.0`  | `#5319E7`            | Polish & Expansion                |

**Priority labels:**

| Label               | Color              | Description         |
| ------------------- | ------------------ | ------------------- |
| `priority:critical` | `#B60205` (red)    | Blocking other work |
| `priority:high`     | `#D93F0B` (orange) | Should be done soon |
| `priority:medium`   | `#FBCA04` (yellow) | Normal priority     |
| `priority:low`      | `#C2E0C6` (mint)   | Nice to have        |

**Status labels:**

| Label          | Color                  | Description                              |
| -------------- | ---------------------- | ---------------------------------------- |
| `blocked`      | `#B60205` (red)        | Blocked by another issue                 |
| `needs-design` | `#D876E3` (pink)       | Needs architecture before implementation |
| `epic`         | `#3E4B9E` (navy)       | Tracking issue for a group of sub-issues |
| `deferred`     | `#C5DEF5` (light blue) | Scoped but deferred to post-ML track     |

### 6.2 Milestones

**Active (ML track):**

| Milestone                    | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| 1.4 Catalog Schema & Seed    | Seed ingestion pipeline: script, integration tests                           |
| 1.5 Catalog API (Read)       | Read-only REST API for shared catalog with full-text search                  |
| 1.5b User Roles & Admin      | Role column, requireRole middleware, admin routes, admin UI                  |
| 1.7 Web Catalog UI           | Catalog browsing: grid/list, detail pages, filtering, search                 |
| 1.9 Photo Management         | Catalog photo upload (curator role), storage, thumbnails, ML training export |
| 1.12 Account Security & GDPR | Account deletion endpoint, PII scrubbing, deletion UI                        |
| 4.0 ML Training Pipeline     | Create ML training, model evaluation, model serving                          |
| 2.0 iOS App + Inference      | iOS app with camera, ML inference, barcode scanning                          |

**Deferred (post-ML):**

| Milestone                   | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| 1.6 Collection Schema & API | Private collection CRUD with RLS                        |
| 1.8 Web Collection UI       | Collection management: add/edit/remove, tags, dashboard |
| 1.10 CSV Import             | Bulk CSV import with column mapping                     |
| 1.11 Basic Reporting        | Collection summary dashboard, value breakdown, export   |
| 3.0 Pricing Integration     | eBay API, price history, valuation, insurance reports   |
| 5.0 Polish & Expansion      | Object detection, more APIs, community features         |

### 6.3 GitHub Projects v2

**Project:** "Track'em Toys Roadmap"

**Custom Fields:**

| Field    | Type          | Options                                                                                                                                                                                                |
| -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Priority | Single Select | Critical, High, Medium, Low                                                                                                                                                                            |
| Phase    | Single Select | 1.4 Seed, 1.5 Catalog API, 1.5b Roles & Admin, 1.7 Catalog UI, 1.9 Photos, 1.12 GDPR, 4.0 ML, 2.0 iOS, 1.6 Collection API, 1.8 Collection UI, 1.10 CSV Import, 1.11 Reporting, 3.0 Pricing, 5.0 Polish |
| Effort   | Single Select | XS (< 2h), S (2–4h), M (4–8h), L (1–2d), XL (3–5d)                                                                                                                                                     |
| Track    | Single Select | ML Path, Post-ML, Backlog                                                                                                                                                                              |

**Views:**

| View           | Type   | Configuration                                                                |
| -------------- | ------ | ---------------------------------------------------------------------------- |
| Board          | Kanban | Columns: Backlog / Ready / In Progress / In Review / Done. Grouped by Phase. |
| ML Track       | Table  | Filter: Track = "ML Path". The active development path.                      |
| Full Roadmap   | Table  | All items. Sorted by Phase → Priority.                                       |
| Current Sprint | Table  | Filter: Status = "Ready" or "In Progress".                                   |

### 6.4 Epic Structure

Each phase gets a **tracking issue** (labeled `epic`) with a task list of child issues.

### 6.5 Issue Templates

Three templates in `.github/ISSUE_TEMPLATE/`:

**`feature.yml`** — New features: Summary, Acceptance Criteria, Phase dropdown, Dependencies, Design Notes

**`bug.yml`** — Bug reports: What happened, Steps to reproduce, Expected behavior, Module dropdown

**`task.yml`** — Chores/infra/tests: Summary, Task checklist, Context

---

## 7. Issue Migration Plan

### Existing Open Issues → New Structure

| Issue | Current Labels                  | Add Labels                                                                  | Milestone          | Track   | Action                                          |
| ----- | ------------------------------- | --------------------------------------------------------------------------- | ------------------ | ------- | ----------------------------------------------- |
| #5    | none                            | `ios`, `infra`, `type:chore`, `priority:medium`                             | 2.0 iOS App        | ML Path | Needed for iOS phase                            |
| #6    | `bug`                           | `web`, `type:bug`, `priority:low`                                           | 1.7 Web Catalog UI | ML Path | Fix during web work                             |
| #11   | `enhancement`, `phase-5`, `api` | `type:feature`, `priority:low`, `deferred`                                  | 5.0 Polish         | Post-ML | Backlog                                         |
| #12   | `phase-5`, `security`, `api`    | `type:feature`, `priority:medium`, `deferred`                               | 5.0 Polish         | Post-ML | Backlog                                         |
| #22   | none                            | —                                                                           | —                  | —       | **Close** — superseded by #30                   |
| #24   | none                            | `api`, `db`, `type:feature`, `phase:1.4`, `priority:critical`, `epic`       | 1.4 Seed           | ML Path | Phase 1.4 epic                                  |
| #25   | none                            | `api`, `db`, `type:feature`, `phase:1.4`, `priority:medium`                 | 1.4 Seed           | ML Path | Optional enrichment                             |
| #26   | none                            | `api`, `db`, `type:feature`, `phase:1.4`, `priority:low`                    | 1.4 Seed           | Backlog | Data expansion                                  |
| #27   | none                            | `api`, `db`, `type:feature`, `phase:1.5`, `priority:medium`, `needs-design` | 1.5 Catalog API    | ML Path | Needs design spike                              |
| #28   | none                            | `shared`, `ml`, `type:feature`, `phase:1.4`, `priority:high`                | 1.4 Seed           | ML Path | Research agent accelerates seed data population |
| #30   | none                            | `api`, `db`, `type:feature`, `phase:1.4`, `priority:critical`               | 1.4 Seed           | ML Path | **Critical path**                               |
| #31   | none                            | `api`, `type:test`, `phase:1.4`, `priority:critical`                        | 1.4 Seed           | ML Path | **Critical path**                               |

---

## 8. Proposed New Issues

### Phase 1.5: Catalog API Routes — 7 issues

| Title                                                                    | Labels                   | Effort | Track   |
| ------------------------------------------------------------------------ | ------------------------ | ------ | ------- |
| Migration 014: full-text search GIN indexes on characters + items        | `api`, `db`, `phase:1.5` | M      | ML Path |
| GET /catalog/characters — list with pagination and filtering             | `api`, `phase:1.5`       | M      | ML Path |
| GET /catalog/characters/:slug — detail with sub-groups and combiner info | `api`, `phase:1.5`       | S      | ML Path |
| GET /catalog/items — list with pagination and filtering                  | `api`, `phase:1.5`       | M      | ML Path |
| GET /catalog/items/:slug — detail with joins                             | `api`, `phase:1.5`       | S      | ML Path |
| GET /catalog/manufacturers, toy-lines, reference data endpoints          | `api`, `phase:1.5`       | M      | ML Path |
| GET /catalog/search — full-text search across characters + items         | `api`, `phase:1.5`       | L      | ML Path |

### Phase 1.5b: User Roles & Admin Foundation — 5 issues

| Title                                                                            | Labels                           | Effort | Track   |
| -------------------------------------------------------------------------------- | -------------------------------- | ------ | ------- |
| Migration 014b: add role column to users table (user/curator/admin)              | `api`, `db`, `phase:1.5b`        | S      | ML Path |
| requireRole() Fastify preHandler middleware + role in JWT claims                 | `api`, `phase:1.5b`              | M      | ML Path |
| Admin API routes: user list, role assignment, account management                 | `api`, `phase:1.5b`              | L      | ML Path |
| Admin web UI: user management, role assignment, catalog edit review (code-split) | `web`, `phase:1.5b`              | L      | ML Path |
| Role enforcement integration tests: 403 scenarios, role escalation prevention    | `api`, `type:test`, `phase:1.5b` | M      | ML Path |

### Phase 1.7: Web Catalog UI — 5 issues

| Title                                                                        | Labels                          | Effort | Track   |
| ---------------------------------------------------------------------------- | ------------------------------- | ------ | ------- |
| Catalog browser page with grid/list toggle and pagination                    | `web`, `phase:1.7`              | L      | ML Path |
| Character detail page with sub-groups and related items                      | `web`, `phase:1.7`              | M      | ML Path |
| Item detail page with manufacturer/character/toy-line info and photo gallery | `web`, `phase:1.7`              | M      | ML Path |
| Catalog search UI with instant results                                       | `web`, `phase:1.7`              | M      | ML Path |
| Catalog browsing E2E tests (Playwright)                                      | `web`, `type:test`, `phase:1.7` | M      | ML Path |

### Phase 1.9: Photo Management — 4 issues (1 epic + 3 slices)

| Issue | Title                                              | Labels                    | Effort | Track   |
| ----- | -------------------------------------------------- | ------------------------- | ------ | ------- |
| #37   | Phase 1.9: Photo Management (epic)                 | `api`, `web`, `phase:1.9` | —      | ML Path |
| #79   | Slice 1: Photo storage, upload API, and thumbnails | `api`, `web`, `phase:1.9` | L      | ML Path |
| #77   | Slice 2: Photo upload UI for curators              | `web`, `phase:1.9`        | L      | ML Path |
| #78   | Slice 3: ML training data export                   | `api`, `ml`, `phase:1.9`  | M      | ML Path |

### Phase 1.9b: Photo Enhancements (Post-ML) — 5 issues

| Issue | Title                                       | Labels                     | Effort | Track   |
| ----- | ------------------------------------------- | -------------------------- | ------ | ------- |
| #71   | Photo moderation: NSFW detection + approval | `api`, `web`, `phase:1.9b` | L      | Post-ML |
| #72   | Approval notification dashboard             | `api`, `web`, `phase:1.9b` | M      | Post-ML |
| #73   | Soft delete + 30-day recycle bin            | `api`, `web`, `phase:1.9b` | M      | Post-ML |
| #74   | Caption editing                             | `api`, `web`, `phase:1.9b` | S      | Post-ML |
| #75   | Pending photo visibility                    | `api`, `web`, `phase:1.9b` | M      | Post-ML |

### Phase 1.12: Account Security & GDPR — 3 issues

| Title                                                                                   | Labels                                       | Effort | Track   |
| --------------------------------------------------------------------------------------- | -------------------------------------------- | ------ | ------- |
| DELETE /auth/account endpoint: PII scrubbing, tombstone, hard-delete auth + photos      | `api`, `security`, `phase:1.12`              | L      | ML Path |
| Account deletion web UI: settings page with confirmation dialog                         | `web`, `security`, `phase:1.12`              | M      | ML Path |
| Account deletion integration tests: verify PII scrubbed, tokens revoked, photos removed | `api`, `type:test`, `security`, `phase:1.12` | M      | ML Path |

### Phase 4.0: ML Training Pipeline — 5 issues

| Title                                                                             | Labels                         | Effort | Track   |
| --------------------------------------------------------------------------------- | ------------------------------ | ------ | ------- |
| Training data preparation: export script, augmentation, class balance analysis    | `ml`, `phase:4.0`              | L      | ML Path |
| Create ML image classification model training (transfer learning, ~7MB target)    | `ml`, `phase:4.0`              | XL     | ML Path |
| Model evaluation framework: accuracy metrics, confusion matrix, per-class reports | `ml`, `phase:4.0`              | M      | ML Path |
| Model serving: metadata API + server-side inference endpoint POST /ml/classify    | `api`, `ml`, `phase:4.0`       | L      | ML Path |
| Retraining pipeline documentation and quality gates                               | `ml`, `type:docs`, `phase:4.0` | M      | ML Path |

### Phase 2.0: iOS App + Inference — 5 issues

| Title                                                                               | Labels                   | Effort | Track   |
| ----------------------------------------------------------------------------------- | ------------------------ | ------ | ------- |
| iOS app scaffolding: Swift 6, SwiftUI, SwiftData, auth integration                  | `ios`, `phase:2.0`       | XL     | ML Path |
| Camera + Core ML inference: capture photo, classify, display predictions            | `ios`, `ml`, `phase:2.0` | XL     | ML Path |
| Vision Framework pre-filter: confirm photo contains toy/robot before classification | `ios`, `ml`, `phase:2.0` | M      | ML Path |
| Barcode scanning with AVFoundation + product database lookup                        | `ios`, `phase:2.0`       | L      | ML Path |
| Offline data entry with sync-on-reconnect (SwiftData + CloudKit)                    | `ios`, `phase:2.0`       | XL     | ML Path |

### Deferred: Collection & Pricing — 12 issues

| Title                                                                | Labels                                      | Effort | Track   |
| -------------------------------------------------------------------- | ------------------------------------------- | ------ | ------- |
| Migration 015: collection_items, price_records, tags tables with RLS | `api`, `db`, `phase:1.6`, `deferred`        | L      | Post-ML |
| Collection CRUD routes (POST/GET/PUT/DELETE /collection/items)       | `api`, `phase:1.6`, `deferred`              | L      | Post-ML |
| Price records routes (POST/GET /collection/items/:id/prices)         | `api`, `phase:1.6`, `deferred`              | M      | Post-ML |
| Tags CRUD and item tagging routes                                    | `api`, `phase:1.6`, `deferred`              | M      | Post-ML |
| Collection API integration tests + RLS verification                  | `api`, `type:test`, `phase:1.6`, `deferred` | L      | Post-ML |
| "Add to Collection" flow from catalog item detail                    | `web`, `phase:1.8`, `deferred`              | M      | Post-ML |
| Collection dashboard with summary stats                              | `web`, `phase:1.8`, `deferred`              | L      | Post-ML |
| Collection list with filters, edit, soft-delete                      | `web`, `phase:1.8`, `deferred`              | L      | Post-ML |
| Tag management UI                                                    | `web`, `phase:1.8`, `deferred`              | M      | Post-ML |
| CSV import API + web UI                                              | `api`, `web`, `phase:1.10`, `deferred`      | XL     | Post-ML |
| Collection summary API + dashboard UI                                | `api`, `web`, `phase:1.11`, `deferred`      | L      | Post-ML |
| eBay Browse API integration + price history                          | `api`, `phase:3.0`, `deferred`              | XL     | Post-ML |

**Total: ~47 new issues (35 ML Path + 12 Post-ML) + 12 existing = ~59 tracked items**

---

## 9. Recommended Work Order

### Sprint 1: Seed Pipeline + Research Agent (current)

1. **#28** — Build Transformers research agent/skill for catalog data population (accelerates all seed work)
2. **#30** — Seed ingestion script (critical path blocker)
3. **#25** — Seed character_appearances data for G1 media depictions (stretch goal — use research agent to populate; easier to include in ingestion script now than bolt on later)
4. **#31** — Seed ingestion integration tests (validates #30 + #25)

### Sprint 2: Catalog API + User Roles

3. Migration 014: full-text search indexes
4. First catalog route: `GET /catalog/characters` (establishes all patterns)
5. Remaining catalog routes (iterative)
6. Migration 019: role column on users + Migration 020: admin event types
7. `requireRole()` middleware + role in JWT claims
8. Bootstrap admin user (project owner)

### Sprint 3: Admin UI + Web Catalog UI + Catalog Photo Upload

9. Admin routes: user management, role assignment
10. Admin web UI (code-split)
11. Catalog browser page (grid/list)
12. Character + item detail pages
13. Search UI
14. Photo storage abstraction + upload API (requires curator role)
15. Photo gallery component + thumbnail generation
16. ML training data export script

### Sprint 4: ML Training Pipeline + GDPR

17. Training data preparation + export
18. Create ML model training (first model)
19. Model evaluation
20. Server-side inference endpoint or web inference
21. GDPR account deletion API + UI (Phase 1.12, can parallel with ML)

### Sprint 5: iOS App

19. iOS scaffolding + auth
20. Camera + Core ML inference
21. Vision pre-filter
22. Barcode scanning
23. Offline sync

### Post-ML Sprints

24. Collection schema + API (1.6)
25. Collection UI (1.8)
26. CSV Import (1.10)
27. Reporting (1.11)
28. Pricing integration (3.0)

### Parallel / Backlog (any time)

- #27 — Mold relationships
- #6 — React act() warnings
- #26 — Comic book characters
