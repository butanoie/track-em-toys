# ADR: Performance & Scaling Assessment

**Date:** 2026-03-19
**Status:** Living document (assessment, not a decision — update as architecture evolves)
**Scope:** Full stack at 100K users

---

## Context

This document captures identified performance bottlenecks and scaling risks across the entire Track'em Toys stack (API, database, web client). The assessment assumes 100K registered users with typical usage patterns: token refreshes every 10-15 minutes, catalog browsing sessions, and search queries.

### Assumptions

- **Peak concurrent users:** ~10-15% of 100K = 10-15K simultaneous
- **Token refresh rate:** ~170 req/sec sustained (100K users / 10 min refresh interval)
- **Browse/search rate:** ~100-500 req/sec at peak
- **Single API server** unless noted otherwise (horizontal scaling discussed separately)

---

## Critical — Configuration changes required before scale

### 1. Database Connection Pool Exhaustion

**Location:** `api/src/db/pool.ts` (pool config), `api/src/config.ts` (defaults)

**Problem:** Default pool size is 20 connections (`DB_POOL_MAX` env var). Each `withTransaction()` call holds a connection for the full transaction lifetime. At 333+ req/sec, the 20-connection pool saturates immediately — requests queue and hit the 5-second `connectionTimeoutMillis`, returning 500 errors.

**Contributing factors:**

- Token rotation uses `FOR UPDATE` row locks, serializing concurrent refreshes on the same token
- Facet browsing runs 5 parallel queries per request, each consuming a connection
- Search runs 2 parallel queries (data + count)

**Remediation:**

- Set `DB_POOL_MAX=100` via environment variable
- Tune PostgreSQL `max_connections` to match (default is 100)
- At multi-server scale: deploy PgBouncer in transaction mode to multiplex connections
- Monitor with `pg_stat_activity` for connection saturation

**Severity:** Will cause immediate outages under load.

---

## High — Will degrade within months of sustained usage

### 2. `auth_events` Table Unbounded Growth

**Location:** `api/src/db/queries.ts` (logAuthEvent function), `api/db/schema.sql` (table + indexes)

**Problem:** Every signin, refresh, logout, and security event inserts a row. At 100K users:

- ~7M+ rows/day (refreshes + signins + logouts + security events)
- No retention policy exists
- After 90 days: ~630M rows
- Index bloat slows INSERTs and makes `VACUUM` expensive

**Existing indexes:**

- `idx_auth_events_user_id` — user-scoped queries
- `idx_auth_events_type_created` — audit queries by event type
- `idx_auth_events_created_at` — time-range queries (and future retention cleanup)

**Remediation:**

- Implement scheduled retention job: `DELETE FROM auth_events WHERE created_at < NOW() - INTERVAL '90 days'`
- Use batched deletes (1000 rows per iteration) to avoid long table locks
- Consider partitioning by month if retention queries span long time ranges
- Archive to cold storage before deletion if compliance requires it

**Severity:** Gradual degradation — INSERT latency increases over weeks, eventually affecting auth flow response times.

### 3. In-Memory Rate Limiting (Single-Process)

**Location:** `api/src/server.ts` (rate-limit registration)

**Problem:** `@fastify/rate-limit` stores counters in-memory per process. When horizontally scaling to multiple API servers:

- Each server maintains independent counters
- A user can bypass limits by hitting different servers (round-robin LB)
- No global enforcement across the cluster

**Current limits:**

- Auth routes: 5-20 req/min per IP
- Catalog reads: 100 req/min per IP
- Health check: 100 req/min

**Remediation:**

- Single server: current setup is fine — limits are conservative enough
- Multi-server with sticky sessions: acceptable (user stays on one server)
- Multi-server with round-robin: switch to Redis-backed rate limiting (`@fastify/rate-limit` supports Redis store)
- Consider per-user (not just per-IP) limits for authenticated routes

**Severity:** Not a problem at single-server scale. Becomes a gap when horizontally scaling.

---

## Medium — Performance degradation under heavy load

### 4. Search UNION with OR Across Two GIN Indexes

**Location:** `api/src/catalog/search/queries.ts:110-111`

**Problem:** The item search branch matches against both the item's `search_vector` AND the character's `search_vector`:

```sql
WHERE (i.search_vector @@ to_tsquery('simple', $1)
       OR ch.search_vector @@ to_tsquery('simple', $1))
```

PostgreSQL cannot efficiently merge two GIN index scans joined via `OR`. It may fall back to a sequential scan on one branch. Additionally, `ts_rank()` is computed twice per row (lines 99-100).

**Contributing factors:**

- Three JOINs per item row (characters, manufacturers, toy_lines) — all materialized before LIMIT
- Separate count query re-executes the same JOINs and FTS scans

**Remediation:**

- Add a composite `search_vector` generated column on `items` that includes the character name, eliminating the `OR` and the character JOIN from the search hot path
- Consider replacing exact count with "has more" boolean (`LIMIT + 1` pattern)
- Cache count for identical `(query, franchise)` key with short TTL (30s)

**When it matters:** ~10K+ items in the catalog.

### 5. Facet Cross-Filtering — 5 Parallel Queries Per Request

**Location:** `api/src/catalog/items/queries.ts:195-281`

**Problem:** Each facet dimension runs its own `GROUP BY` query excluding its own filter. All 5 queries run in parallel via `Promise.all`, each re-executing the same base JOINs (items → franchises → characters → manufacturers → toy_lines).

**Missing indexes:**

- No composite index on `(franchise_id, size_class)` for compound filtering
- Queries filtering by franchise + size_class scan all franchise items, then filter

**Remediation:**

- Add index: `CREATE INDEX idx_items_franchise_size_class ON items(franchise_id, size_class)`
- Consider materialized facet counts for slow-changing catalog data (refresh on catalog edits)
- Monitor with `EXPLAIN ANALYZE` to identify which facet query is slowest

**When it matters:** ~10K+ items with active browsing.

### 6. TanStack Query `refetchOnWindowFocus` Default

**Location:** `web/src/routes/__root.tsx` (QueryClient config)

**Problem:** TanStack Query defaults to refetching all active queries on every browser focus event. Users with multiple tabs or switching between apps trigger refetches constantly. At 100K users, this multiplies API traffic by 5-10x during normal usage patterns.

**Additional config gaps:**

- `gcTime` not set (defaults to 5 minutes — aggressively evicts cached data)
- `refetchOnReconnect` not disabled (flaky networks cause repeated refetches)

**Remediation:**

```typescript
const [queryClient] = useState(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 15 * 60 * 1000,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    })
);
```

**Impact:** Reduces unnecessary API traffic significantly. Per-hook `staleTime` overrides already cover most catalog queries, but this catches any hooks that rely on defaults.

### 7. User Status DB Query on Every Token Refresh

**Location:** `api/src/auth/routes.ts:638-643`

**Problem:** Every `/auth/refresh` call queries the `users` table to check `deactivated_at`/`deleted_at` status. At 100K users refreshing every 10-15 minutes: ~170 queries/sec just for status checks that almost always return "active."

**Why it exists:** Deactivated/deleted users must be locked out even if they hold a valid refresh token. The check is security-critical.

**Remediation (when needed):**

- Embed user status epoch in JWT claims; only hit DB when epoch is stale
- Or: cache active user set in Redis with short TTL (60s), evict on admin action
- Trade-off: adds latency to deactivation enforcement (up to TTL duration)

### 8. Manufacturer Stats — Full Table Scan

**Location:** `api/src/catalog/manufacturers/queries.ts`

**Problem:** Manufacturer stats query uses subquery JOINs that scan the entire `items` and `toy_lines` tables on every call. No caching.

**Remediation:**

- HTTP-level caching (`Cache-Control: max-age=3600`) — catalog data changes infrequently
- Or: materialized view refreshed on catalog edits
- Or: pre-compute stats in a `manufacturer_stats` table updated by triggers

---

## Network Layer

### 9. CORS Preflight Requests — No Caching

**Location:** `api/src/server.ts:62-66`

**Problem:** Every `PATCH`, `PUT`, `DELETE`, and any request with `Content-Type: application/json` triggers an OPTIONS preflight. `Access-Control-Max-Age` is not set, so browsers send a preflight before _every_ non-simple request — effectively doubling the request count for all write operations and JSON-body POSTs.

At 100K users, that's significant wasted bandwidth and latency (each preflight adds a full round-trip before the actual request can proceed).

**Remediation:**

- Add `maxAge: 86400` (24 hours) to the `@fastify/cors` config
- Browsers will cache the preflight response and skip it for subsequent requests to the same endpoint
- Verify CDN/proxy doesn't strip the `Access-Control-Max-Age` header

**Severity:** Medium — highest ROI fix (one config line eliminates a round-trip from every write request).

### 10. OAuth Provider Network I/O on Signin

**Location:** `api/src/auth/apple.ts:12-54`, `api/src/auth/google.ts:13-35`

**Problem:** Both `verifyAppleToken()` and `verifyGoogleToken()` make outbound HTTPS calls to Apple/Google JWKS endpoints during every signin. These take 200-500ms typically, up to several seconds on provider-side degradation.

**What goes wrong at scale:**

- Signin spikes (e.g., after a marketing push) create a thundering herd of outbound requests
- If Apple/Google is slow, connections pile up waiting for external responses
- Node.js handles this fine (async I/O), but the connection pool and rate limits get pressure from long-lived request handlers

**Already mitigated:** Signin rate limited to 10 req/min per IP. But corporate networks sharing one IP could still see contention.

**Remediation:**

- Cache provider JWKS locally with TTL (Apple/Google rotate keys infrequently — every few weeks)
- Libraries like `jwks-rsa` support automatic JWKS caching natively
- Fallback: if cached key fails verification, fetch fresh JWKS once

**When it matters:** Signin spikes or provider degradation.

---

## Node.js Runtime

### 11. Single-Threaded Event Loop — CPU Ceiling

**Problem:** Node.js runs all request handling on one thread. CPU-bound work per request is small individually but adds up at 500+ req/sec:

| Operation                                | Cost per request | Frequency                   |
| ---------------------------------------- | ---------------- | --------------------------- |
| JWT ES256 verify                         | ~1-2ms           | Every authenticated request |
| Cookie HMAC verify                       | ~0.5ms           | Every /refresh, /logout     |
| JSON serialization (fast-json-stringify) | ~0.5-2ms         | Every response              |
| Search string tokenization               | ~0.1ms           | Every search                |
| Cursor base64 encode/decode              | ~0.1ms           | Every paginated request     |

At 500 req/sec, that's ~1-2 seconds of CPU work per second — leaving only 50-75% headroom for GC pauses and other operations. A single slow synchronous operation would block everything.

**Remediation:**

- Run multiple Node.js processes via `cluster` module or container orchestration
- Monitor event loop lag (`perf_hooks` or a library like `blocked-at`)
- Keep synchronous work out of hot paths (already well-handled in current code)

**When it matters:** 500+ req/sec sustained on a single process.

### 12. Unbounded Photo Arrays in Item Detail Responses

**Location:** `api/src/catalog/items/queries.ts` (getItemBySlug)

**Problem:** The item detail query fetches all photos for an item with no pagination or limit. If curators upload 100+ reference photos per item (plausible for popular characters), response payloads grow to multi-MB territory. Under concurrent load, Node.js must hold all response buffers simultaneously, creating memory pressure.

**Remediation:**

- Add `LIMIT 20` on the photos subquery with a `has_more_photos` flag
- Or: paginate photos via a separate endpoint (`GET /catalog/.../items/:slug/photos?page=N`)
- Add `loading="lazy"` to non-primary photo `<img>` tags on the web client

**When it matters:** Phase 1.9 (photo upload) ships and curators add many photos per item.

---

## Web Client

### 13. No Image Optimization

**Location:** `web/src/catalog/components/ItemDetailPanel.tsx`

**Problem:** Current `<img src={url}>` renders with no optimization:

- No `loading="lazy"` — all images load eagerly, even below the fold
- No `srcset` for responsive sizing — full-resolution images on mobile
- No CDN or image transformation pipeline

At 100K users, the origin server (or wherever photos are hosted) serves full-resolution images to every device. Without a CDN, bandwidth costs and latency spike.

**Remediation:**

- Serve images through a CDN (CloudFront, Cloudflare) with auto-resizing
- Add `loading="lazy"` to all non-primary images
- Use `srcset` with multiple sizes for responsive delivery
- Consider WebP/AVIF format conversion at the CDN edge

**When it matters:** Phase 1.9 (photo upload) ships.

### 14. No Service Worker / Offline Support

**Problem:** If the API goes down or the user has flaky connectivity:

- All TanStack Query requests fail after retries
- Components show error states, but no cached fallback
- Catalog data (which changes rarely) could easily be served from a stale cache

**Current graceful degradation:**

- TanStack Query retries 3 times before showing error state
- Error states are localized to the component that failed (not a full-page crash)
- Other parts of the UI remain interactive (nav, cached queries via `keepPreviousData`)

**Remediation:**

- Add a service worker with stale-while-revalidate strategy for catalog reads
- Show "offline mode" indicator when network is unavailable
- Cache critical assets (franchise list, popular items) for offline browsing
- Vite PWA plugin or Workbox for service worker generation

**When it matters:** Mobile users with spotty connectivity; API downtime incidents.

### 15. No Client-Side Error Reporting

**Location:** `web/src/components/ErrorBoundary.tsx` (line 30 — TODO comment)

**Problem:** `ErrorBoundary` catches render-phase errors and shows a fallback UI, but does not report errors to any monitoring service. At 100K users, client-side crashes, unhandled promise rejections, and auth flow failures will go undetected until users complain.

**Remediation:**

- Integrate Sentry, Datadog RUM, or similar before production launch
- Report: render errors (ErrorBoundary), unhandled rejections, auth refresh failures
- Include user context (role, current route) for debugging
- Set up alerting on error rate spikes

**When it matters:** Before production launch with real users.

---

## Low Risk — Well-handled

| Area                            | Assessment                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| JWT ES256 signing/verification  | CPU-bound ~1ms/op; keys cached in memory at startup                                                                |
| Web bundle splitting            | `autoCodeSplitting: true`; admin code never ships to regular users. Main bundle 127 KB gzipped, CSS 7.1 KB gzipped |
| Token refresh mutex (web)       | Deduplicates concurrent 401 retries via shared promise                                                             |
| Memory leaks (web)              | All timers, listeners, subscriptions properly cleaned up on unmount                                                |
| React provider re-renders       | Minimal provider stack (QueryClient → Google OAuth → Auth → Outlet)                                                |
| Catalog read queries            | Use `pool.query()` directly — no transaction overhead                                                              |
| Search debounce (web)           | 300ms debounce with proper cleanup; `keepPreviousData` prevents flicker                                            |
| Cursor pagination (items/chars) | Indexed by `(name, id)` — efficient for forward traversal                                                          |
| Dependency tree                 | 10 production deps, no bundle-killers (no lodash, moment, date-fns full)                                           |
| Tailwind CSS                    | Vite plugin (compiled, tree-shaken) — 7.1 KB gzipped CSS output                                                    |
| Apple SDK loading               | Dynamic injection with deduplication (in-flight promise), fail-closed nonce validation                             |
| Fastify schema compilation      | Static `const` schemas compiled once at startup, not per-request                                                   |
| In-memory caching               | No unbounded caches — key store ~1 KB, JWKS ~1 KB, rate limit state <1 MB                                          |
| Cookie handling                 | HMAC on signed cookies only (~0.5ms), limited to /refresh and /logout routes                                       |
| Search string processing        | Synchronous but CPU-cheap (~0.1ms for typical input <100 chars)                                                    |

---

## Remediation Roadmap

> **Updated 2026-03-23** after re-audit. Original roadmap assumed all items were scale-dependent. Re-assessment found several items are correctness or best-practice gaps that should ship before real users, regardless of scale. Reorganized into urgency tiers.

### Tier 1 — Fix NOW (quick wins + correctness)

Items that are either one-liner config fixes or correctness bugs independent of user count.

| #   | Action                                                            | Effort      | Files                                                                              | Tracking                                          |
| --- | ----------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| 1   | Add CORS `maxAge: 86400`                                          | 1 line      | `api/src/server.ts`                                                                | #109                                              |
| 2   | Add `refetchOnWindowFocus: false` + `gcTime: 15min`               | 5 min       | `web/src/routes/__root.tsx`                                                        | #109                                              |
| 3   | Add `loading="lazy"` to all `<img>` elements                      | 30 min      | `PhotoGallery.tsx`, `ItemList.tsx`, `CollectionGrid.tsx`, `CollectionItemCard.tsx` | #109                                              |
| 4   | Fix `auth_events` FK: `ON DELETE SET NULL` → `ON DELETE RESTRICT` | 1 migration | `api/db/migrations/` (see new finding below)                                       | #109                                              |
| 5   | ~~Add `LIMIT` to photo subquery + `has_more_photos`~~             | —           | —                                                                                  | Dropped — curators decide photo count; no API cap |

### Tier 2 — Fix SOON (before real traffic)

Not blocking current feature work, but should ship before production users.

| #   | Action                                            | Effort  | Files                                                               | Tracking |
| --- | ------------------------------------------------- | ------- | ------------------------------------------------------------------- | -------- |
| 6   | Set `DB_POOL_MAX=100` + tune PG `max_connections` | Env var | `.env`, `postgresql.conf`                                           | #110     |
| 7   | Implement `auth_events` retention cron            | 2-4 hrs | New migration + scheduled job                                       | #110     |
| 8   | Integrate error reporting (Sentry/Datadog)        | 2-4 hrs | `web/src/components/ErrorBoundary.tsx`, `web/src/routes/__root.tsx` | #110     |

### Tier 3 — At ~10K users (monitoring-driven)

| #   | Action                                                     | Effort              | Files                                             |
| --- | ---------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| 9   | Add composite index `(franchise_id, size_class)`           | Migration           | `api/db/migrations/`                              |
| 10  | Run `EXPLAIN ANALYZE` on search queries                    | Analysis            | —                                                 |
| 11  | Add composite `search_vector` on items if OR scan is slow  | Migration + trigger | `api/db/migrations/`                              |
| 12  | Add `Cache-Control` headers to manufacturer stats endpoint | 30 min              | `api/src/catalog/manufacturers/routes.ts`         |
| 13  | Cache OAuth provider JWKS locally with TTL                 | 2-4 hrs             | `api/src/auth/apple.ts`, `api/src/auth/google.ts` |

### Tier 4 — At multi-server scale

| #   | Action                                     | Effort  | Files                                              |
| --- | ------------------------------------------ | ------- | -------------------------------------------------- |
| 14  | Deploy PgBouncer for connection pooling    | Infra   | —                                                  |
| 15  | Switch to Redis-backed rate limiting       | 2-4 hrs | `api/src/server.ts`                                |
| 16  | Cache user status in JWT or Redis          | 4-8 hrs | `api/src/auth/routes.ts`, `api/src/auth/tokens.ts` |
| 17  | Consider read replicas for catalog queries | Infra   | `api/src/db/pool.ts`                               |
| 18  | Node.js cluster or container orchestration | Infra   | —                                                  |

### Tier 5 — Nice-to-have

| #   | Action                                            | Effort   | Files                           |
| --- | ------------------------------------------------- | -------- | ------------------------------- |
| 19  | Service worker for catalog offline cache          | 8-16 hrs | New `web/src/service-worker.ts` |
| 20  | Monitor event loop lag via `perf_hooks`           | 1-2 hrs  | `api/src/server.ts`             |
| 21  | CDN for image delivery with auto-resizing         | Infra    | —                               |
| 22  | `srcset` for responsive image delivery            | 2-4 hrs  | Photo components                |
| 23  | Collection/photo grid virtualization (500+ items) | 4-8 hrs  | Collection components           |

---

## New Finding: `auth_events` ON DELETE SET NULL (2026-03-23 audit)

**Location:** `api/db/migrations/005_create_auth_events.sql:4`

**Problem:** The migration defines `user_id UUID REFERENCES users(id) ON DELETE SET NULL`. This contradicts the project's GDPR tombstone pattern — user rows are never deleted, they are scrubbed and retained. If a user row were ever accidentally deleted, all their `auth_events.user_id` values would silently become NULL, breaking audit trail traceability.

**Context:** Migration 021 already corrected `oauth_accounts` and `refresh_tokens` from CASCADE to RESTRICT. The `auth_events` table was missed.

**Remediation:** Add a migration to change the FK to `ON DELETE RESTRICT`, consistent with all other user-referencing tables.

---

## Monitoring Checklist

When approaching scale, instrument these metrics:

**Database:**

- `pg_stat_activity` connection count, wait events, idle connections
- p50/p95/p99 query latency for search, facet, and auth queries via `pg_stat_statements`
- `auth_events` table row count and bloat ratio (`pgstattuple`)

**API Server:**

- p95 response latency per route (Fastify request logging)
- Rate limit rejections: count of 429 responses per route
- Event loop lag (blocked-at or `perf_hooks.monitorEventLoopDelay`)
- Memory usage (RSS, heap used/total) per process
- Outbound request latency to Apple/Google JWKS endpoints

**Web Client:**

- Core Web Vitals: LCP, FID/INP, CLS via browser Performance API
- TanStack Query cache hit/miss ratio (dev tools in staging)
- Client-side error rate (Sentry/Datadog)
- Bundle size tracking per route chunk (CI integration)
