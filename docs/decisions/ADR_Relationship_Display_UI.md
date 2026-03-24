# ADR: Relationship Display UI (Issue #85)

**Date:** 2026-03-20
**Status:** Accepted
**Depends on:** PR #84 (Relationship API endpoints), Phase 1.7 (Catalog Browsing UI)
**GitHub Issue:** #85

---

## Context

PR #84 added backend relationship endpoints for both characters and items:

- `GET /catalog/franchises/:franchise/characters/:slug/relationships`
- `GET /catalog/franchises/:franchise/items/:slug/relationships`

Character relationships cover 7 types: combiner-component, partner-bond, vehicle-crew, rival, sibling, mentor-student, evolution. Item relationships cover 3 types: mold-origin, gift-set-contents, variant.

Zod schemas (`CharacterRelationshipSchema`, `ItemRelationshipSchema`) already exist in `web/src/lib/zod-schemas.ts`.

This ADR documents the UI design decisions for rendering these relationships on detail pages.

---

## Design Decisions

### 1. Grouped List by Relationship Type

**Decision:** Render relationships grouped by `type`, with a human-readable heading per group. Not a flat list, not a table, not a graph.

**Why:** Character entities can have relationships across multiple types (e.g., Devastator has combiner-component AND rival relationships). A flat list loses the semantic grouping. A table adds unnecessary chrome for what is essentially a labeled list. A graph/network visualization is overkill for a detail page with typically < 20 relationships.

**Format:**

```
Combiner Components
  Scrapper ·· right leg
  Hook ······ left shoulder
Rival
  Omega Supreme ·· rival
```

### 2. Inline Roles as Muted Text

**Decision:** The `role` field renders as muted secondary text after the link, matching the existing pattern used for manufacturer names in the "Related Items" section (e.g., `Scrapper (right leg)`).

**Why:** Roles provide essential context — "right leg" for a combiner component, "driver" for a vehicle-crew relationship — but are secondary to the entity name. The parenthetical pattern is already established in the codebase.

**Exception:** Symmetric character types (`rival`, `sibling`) where both sides have the same role — the role adds no information and can be omitted. Specifically, when `role` equals the type name (e.g., `role: "rival"` under type `"rival"`), it's redundant under the heading. Distinct roles like `"twin"` under `"sibling"` would still display.

**Item relationships have NO symmetric types** — `variant` uses `base`/`variant` roles, `mold-origin` uses directional roles, `gift-set-contents` uses `set`/`contents`. All item roles are always shown.

### 3. Subtype on Group Heading When Uniform

**Decision:** When all relationships in a type group share the same subtype (e.g., all partner-bonds are "headmaster"), render it as a Badge on the group heading. When subtypes vary within a group, render per-item.

**Why:** Subtypes provide categorical context (headmaster vs targetmaster vs powermaster). Showing it once on the heading is cleaner when uniform; per-item when mixed.

### 4. Section Placement

**Decision:**

- **Character detail:** After Sub-Groups, before Appearances. Relationships describe who the character is connected to — more fundamental than media appearances.
- **Item detail:** After the description/badges, as the last section. Item relationships (mold-origin, variants, gift-sets) are supplementary catalog data.

**Why:** Information architecture follows conceptual importance. Character relationships define the character's identity in the universe. Item relationships are catalog cross-references.

### 5. Empty State: Section Not Rendered

**Decision:** If the relationships array is empty, the entire "Relationships" section is hidden.

**Why:** Consistent with existing pattern — Sub-Groups and Related Items sections both conditionally render only when data exists.

### 6. Three-Layer Architecture

**Decision:** The implementation uses three layers:

1. **Pure utility module** (`relationship-utils.ts`) — data transformation (grouping, formatting, symmetric detection). No React imports.
2. **Generic display component** (`RelationshipSection`) — renders pre-grouped data with headings, badges, roles, and link slots via `renderLink` callback. Router-agnostic.
3. **Integration components** (`CharacterRelationships`, `ItemRelationships`) — own their own data fetch via hooks, transform data using utilities, and pass grouped results to `RelationshipSection`. These embed directly in content components.

**Why:** Separating transformation from rendering enables pure unit tests for grouping/formatting logic. The integration components owning their own fetch means panels and pages both get relationships without prop threading — no changes needed to panel components.

**Trade-off:** Parent component tests (`CharacterDetailContent.test.tsx`, `ItemDetailContent.test.tsx`, panel tests) must mock the integration components via `vi.mock` since they call hooks internally.

### 7. Type Labels Derived Client-Side

**Decision:** Convert type slugs to human-readable labels client-side (e.g., `combiner-component` → "Combiner Components"). No server-side label field needed.

**Why:** The type slugs are already descriptive English phrases with hyphens. A simple `formatRelationshipType()` utility handles the conversion. Adding a label field to the API response would be redundant.

### 8. Separate TanStack Query Hooks

**Decision:** Dedicated `useCharacterRelationships` and `useItemRelationships` hooks, fetched independently from the main detail query.

**Why:** Relationships are a secondary concern — the detail page should render immediately with core data. Relationship data loads in parallel via a separate query, following the established pattern where `CharacterDetailPage` already fetches related items as a separate `useQuery` call.

---

## Alternatives Considered

### Network Graph Visualization

Rejected — too complex for a detail page, requires a visualization library, and the relationship count per entity is small (typically < 20). Could be revisited for a dedicated "relationship explorer" page in the future.

### Table Layout

Rejected — tables imply structured columnar data. Relationships are more naturally a grouped list with variable metadata (some have roles, some have subtypes, some have neither).

### Relationship Data Embedded in Detail Response

Rejected — would couple the detail and relationship queries, making the detail response slower. The current architecture keeps them independent.

---

### 9. API Role Semantics

**Decision:** The `role` field in the API response always describes the **related** entity, not the current entity. This is a consequence of the UNION ALL query structure.

**Example:** Viewing Devastator's page shows `Scrapper (right leg)` — the role "right leg" describes Scrapper's position. Viewing Scrapper's page shows `Devastator (gestalt)` — the role "gestalt" describes Devastator.

**No transformation needed** — the API response is already in the correct shape for display.

---

## Component Summary

| Component                   | Type | Purpose                                                             |
| --------------------------- | ---- | ------------------------------------------------------------------- |
| `relationship-utils.ts`     | New  | Pure utility module: grouping, formatting, symmetric detection      |
| `RelationshipSection`       | New  | Generic grouped-list renderer (router-agnostic)                     |
| `CharacterRelationships`    | New  | Integration: fetches + transforms + renders character relationships |
| `ItemRelationships`         | New  | Integration: fetches + transforms + renders item relationships      |
| `useCharacterRelationships` | New  | TanStack Query hook                                                 |
| `useItemRelationships`      | New  | TanStack Query hook                                                 |
| `api.ts`                    | Edit | Add `getCharacterRelationships`, `getItemRelationships`             |
| `CharacterDetailContent`    | Edit | Embed `<CharacterRelationships />`                                  |
| `ItemDetailContent`         | Edit | Embed `<ItemRelationships />`                                       |

### Test Impact

| Test File                           | Change                                     |
| ----------------------------------- | ------------------------------------------ |
| `CharacterDetailContent.test.tsx`   | Add `vi.mock` for `CharacterRelationships` |
| `ItemDetailContent.test.tsx`        | Add `vi.mock` for `ItemRelationships`      |
| `CharacterDetailPanel.test.tsx`     | Add `vi.mock` for `CharacterRelationships` |
| `ItemDetailPanel.test.tsx`          | Add `vi.mock` for `ItemRelationships`      |
| `relationship-utils.test.ts`        | New — pure unit tests                      |
| `RelationshipSection.test.tsx`      | New — component rendering tests            |
| `CharacterRelationships.test.tsx`   | New — integration component tests          |
| `ItemRelationships.test.tsx`        | New — integration component tests          |
| `useCharacterRelationships.test.ts` | New — hook tests                           |
| `useItemRelationships.test.ts`      | New — hook tests                           |
| `catalog-test-helpers.tsx`          | Add relationship mock fixtures             |
