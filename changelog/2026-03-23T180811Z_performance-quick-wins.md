# Performance Quick Wins — CORS, QueryClient, Lazy Loading, auth_events FK

**Date:** 2026-03-23
**Time:** 18:08:11 UTC
**Type:** Configuration / Feature
**Phase:** 1.8 Collection UI (cross-cutting)
**Issue:** #109

## Summary

Implemented 4 performance and correctness quick wins identified during a re-audit of the Performance & Scaling Assessment ADR. Also extracted a duplicated utility function during code review. These changes reduce unnecessary API traffic, improve image loading performance, and fix a FK constraint inconsistency.

---

## Changes Implemented

### 1. CORS Preflight Caching

Added `maxAge: 86400` (24 hours) to `@fastify/cors` config. Browsers now cache OPTIONS preflight responses instead of sending one before every PATCH/PUT/DELETE request.

**Modified:** `api/src/server.ts`

### 2. TanStack Query Client Defaults

Added global defaults to reduce unnecessary API traffic:

- `refetchOnWindowFocus: false` — prevents refetching all queries on tab focus
- `refetchOnReconnect: false` — prevents refetch storms after network recovery
- `gcTime: 15 * 60 * 1000` — keeps inactive query cache for 15 minutes (up from 5 min default)

Per-hook overrides (e.g., `staleTime: 30_000` on collection hooks) continue to take precedence.

**Modified:** `web/src/routes/__root.tsx`

### 3. Image Lazy Loading

Added `loading="lazy"` to all thumbnail `<img>` elements across catalog and collection UIs. Hero/displayed photos and lightbox images intentionally left eager-loaded to avoid above-the-fold pop-in.

**Modified:**

- `web/src/collection/components/CollectionTable.tsx`
- `web/src/collection/components/CollectionItemCard.tsx`
- `web/src/catalog/components/ItemList.tsx`
- `web/src/catalog/components/PhotoGallery.tsx` (thumbnails only)
- `web/src/catalog/photos/PhotoGrid.tsx`

### 4. auth_events FK Constraint Correction

Changed `auth_events.user_id` from `ON DELETE SET NULL` to `ON DELETE RESTRICT`, aligning with the project's GDPR tombstone pattern. Migration 021 previously fixed `oauth_accounts` and `refresh_tokens` — `auth_events` was missed.

**Created:** `api/db/migrations/030_auth_events_fk_restrict.sql`

### 5. DRY: formatRelativeDate Extraction

Extracted identical `formatRelativeDate` function from `CollectionTable` and `CollectionItemCard` into a shared utility with unit tests.

**Created:**

- `web/src/collection/lib/format-date.ts`
- `web/src/collection/lib/format-date.test.ts`

**Modified:**

- `web/src/collection/components/CollectionTable.tsx` — import shared util
- `web/src/collection/components/CollectionItemCard.tsx` — import shared util

---

## Technical Details

### ADR Update

Reorganized `docs/decisions/ADR_Performance_Scaling_Assessment.md` remediation roadmap from 5 phases into urgency-based tiers (NOW / SOON / 10K users / multi-server / nice-to-have). Added GitHub issue references and documented the new `auth_events` FK finding.

Photo LIMIT item was dropped from scope — curators decide how many photos to upload; the API returns them all.

---

## Validation & Testing

```
API:  35 test files, 716 tests passed, 0 failures
Web:  84 test files, 638 tests passed, 0 failures
Build: clean (both modules)
Lint:  clean (both modules)
Typecheck: clean (both modules)
```

---

## Impact Assessment

- **API traffic reduction:** Disabling `refetchOnWindowFocus` eliminates 5-10x traffic multiplier from tab switches at any user count
- **Network overhead:** CORS `maxAge` eliminates one round-trip from every write request
- **Mobile performance:** `loading="lazy"` defers below-the-fold image loads, improving LCP
- **Data integrity:** `ON DELETE RESTRICT` prevents accidental audit trail loss

---

## Related Files

| File                                                   | Action   |
| ------------------------------------------------------ | -------- |
| `api/src/server.ts`                                    | Modified |
| `api/db/migrations/030_auth_events_fk_restrict.sql`    | Created  |
| `web/src/routes/__root.tsx`                            | Modified |
| `web/src/collection/lib/format-date.ts`                | Created  |
| `web/src/collection/lib/format-date.test.ts`           | Created  |
| `web/src/collection/components/CollectionTable.tsx`    | Modified |
| `web/src/collection/components/CollectionItemCard.tsx` | Modified |
| `web/src/catalog/components/ItemList.tsx`              | Modified |
| `web/src/catalog/components/PhotoGallery.tsx`          | Modified |
| `web/src/catalog/photos/PhotoGrid.tsx`                 | Modified |
| `docs/decisions/ADR_Performance_Scaling_Assessment.md` | Modified |

---

## Status

✅ COMPLETE
