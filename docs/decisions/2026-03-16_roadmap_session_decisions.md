# Roadmap Planning Session — Decisions Record

**Date:** 2026-03-16
**Context:** Planning session to create a formalized development roadmap and GitHub project tracking strategy.

---

## Decision 1: ML-Accelerated Roadmap (Web-First)

**Decision:** Prioritize ML photo identification over collection management features. Use a web-first approach to get training data flowing as fast as possible.

**Critical path:** 1.4 (Seed) → 1.5 (Catalog API) → 1.5b (Roles) → 1.9 (Photo Upload) → 4.0 (ML Training) → 2.0 (iOS + Inference)

**Rationale:** The `item_photos` table already has a direct FK to `items` (shared catalog). Catalog photos can be uploaded and used for ML training without building private collection infrastructure first. This cuts the path to ML from ~8 sub-phases to ~6.

**Impact:** Collection features (private items, pricing, tags, CSV import, reporting) are deferred until after ML is functional.

---

## Decision 2: Defer Collection Features Until Post-ML

**Decision:** All collection management features are deferred until after ML identification is working.

**Deferred phases:** 1.6 (Collection API), 1.8 (Collection UI), 1.10 (CSV Import), 1.11 (Reporting), 3.0 (Pricing)

**Rationale:** These features have no ML dependency. Building them first would delay the ML pipeline by several sprints. The app will be a "catalog + identify" tool before it becomes a "collect + value" tool.

---

## Decision 3: OAuth-Only Authentication

**Decision:** Email/password authentication (requirements doc item 5) is not needed. Apple + Google OAuth2 is sufficient.

**Rationale:** The requirements doc specified email/password with bcrypt as the primary auth method, with OAuth2 as supplementary. The implementation went OAuth-only, which is acceptable for this project's target audience (personal tool for serious collectors).

**Impact:** No need to build password reset flows, bcrypt hashing, or email verification. Simplifies the auth surface.

---

## Decision 4: Two Photo Domains (Catalog vs. Personal)

**Decision:** There are two distinct types of photos with different privacy models:

| Domain                     | Table           | Visibility                 | RLS                          | ML Training                       | When                   |
| -------------------------- | --------------- | -------------------------- | ---------------------------- | --------------------------------- | ---------------------- |
| **Catalog photos**         | `item_photos`   | Shared, all users see them | None                         | Yes — directly, no consent needed | Phase 1.9 (ML path)    |
| **User collection photos** | New table (TBD) | Private to owner           | Yes, via `uploaded_by` + RLS | No (or opt-in later)              | Post-ML with Phase 1.6 |

**Rationale:** Catalog photos are centrally managed app content (product shots, box art) — reference images that all users see. They feed ML training directly because they are app-managed, not user PII. User collection photos (condition shots of their own items) are personal and private — these come later with the collection schema.

**Impact:** No RLS needed on `item_photos` during the ML path. No consent mechanism needed for ML training. Simplifies Phase 1.9 significantly.

---

## Decision 5: GDPR Account Deletion (Phase 1.12)

**Decision:** Add a GDPR-compliant account deletion feature to the roadmap.

**Scope:**

- `DELETE /auth/account` endpoint with PII scrubbing (tombstone pattern)
- Hard-delete refresh tokens, OAuth accounts
- Remove user's catalog photo contributions from storage
- Web UI with explicit confirmation dialog
- Can be implemented in parallel with any phase; must ship before app is user-facing

**Rationale:** Requirements doc section 7b mandates GDPR right to erasure. The `deleted_at` column exists (migration 012) but no deletion logic is implemented.

---

## Decision 6: Hybrid Admin Approach (Option 3)

**Decision:** Implement user roles and admin functionality within the same web application, using role-gated routes with code-splitting. Do not build a separate admin app.

**Roles:**

- `user` — Browse catalog, manage own collection (post-ML)
- `curator` — All user powers + manage catalog items, characters, photos, review edits
- `admin` — All curator powers + user management, role assignment, account operations

**Implementation:**

- `users.role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'curator', 'admin'))`
- `requireRole()` Fastify preHandler middleware
- Role included in JWT access token claims
- Admin web routes under `/admin/*`, lazy-loaded (code-split)
- First user bootstrapped as admin via CLI command

**Alternatives considered:**

1. **Role column, same app** — Too simple, no code-splitting
2. **Separate admin app** — Strongest security but doubles maintenance burden; overkill for current scale
3. **Hybrid (chosen)** — Role column + same app + code-split admin routes. Can extract to separate app later if security requirements tighten.

**Rationale:** This is currently a personal/small-team tool, not a public SaaS. The `catalog_edits` table already implies reviewer roles (`editor_id`, `reviewed_by`, `status`). A simple role column covers the immediate need. The hybrid approach provides security via role enforcement + code-splitting while keeping deployment simple.

---

## Decision 7: GitHub Tracking Strategy

**Decision:** Use GitHub Projects v2 + Milestones + structured labels for project tracking.

**Structure:**

- **Projects v2:** "Track'em Toys Roadmap" with custom fields (Priority, Phase, Effort, Track)
- **Milestones:** One per sub-phase (1.4, 1.5, 1.5b, 1.7, 1.9, 1.12, 4.0, 2.0 active; 1.6, 1.8, 1.10, 1.11, 3.0, 5.0 deferred)
- **Labels:** `namespace:value` pattern — `type:*`, `phase:*`, `priority:*`, module labels
- **Epics:** Parent issues with task list sub-issues
- **Issue templates:** feature.yml, bug.yml, task.yml

**Rationale:** Three orthogonal tracking dimensions — milestones for "when", labels for "what kind", project board for "what's the status". The `namespace:value` label pattern groups labels alphabetically in the GitHub UI.
