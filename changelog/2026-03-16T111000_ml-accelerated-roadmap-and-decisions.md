# ML-Accelerated Development Roadmap and Architectural Decisions

**Date:** 2026-03-16
**Time:** 11:10:00 -0700
**Type:** Documentation Standards
**Phase:** 1.4 (Catalog Schema/Seed)
**Version:** v0.4.0

## Summary

Formalized the ML-accelerated development roadmap with a web-first strategy that prioritizes photo identification over collection management. Documented 7 key architectural decisions and updated all module-level CLAUDE.md files with new conventions for roles, photo domains, and development strategy. Added GitHub issue templates for standardized project tracking.

---

## Changes Implemented

### 1. Development Roadmap

Authored the full development roadmap (`docs/plans/Development_Roadmap_v1_0.md`) defining the ML-first phase sequence: 1.4 (Seed) → 1.5 (Catalog API) → 1.5b (Roles) → 1.9 (Photos) → 4.0 (ML) → 2.0 (iOS). This reorders the original plan to deliver ML-powered toy identification before building out collection management features.

**Created:**
- `docs/plans/Development_Roadmap_v1_0.md` — 759-line roadmap with phase definitions, dependencies, and milestones

### 2. Architectural Decision Records

Documented 7 architectural decisions covering the project's core design choices.

**Created:**
- `docs/decisions/2026-03-16_roadmap_session_decisions.md` — Captures decisions on:
  1. ML-accelerated web-first development path
  2. OAuth-only authentication (no email/password)
  3. Two photo domains (catalog shared vs user private)
  4. User roles model (user / curator / admin)
  5. Hybrid admin approach (web admin + iOS curator)
  6. GDPR account deletion via tombstone pattern
  7. GitHub project tracking strategy

**Modified:**
- `docs/decisions/Schema_Design_Rationale.md` — Added rationale for roles and photo privacy schema design

### 3. CLAUDE.md Convention Updates

Updated all module-level instruction files to reflect the new architectural decisions, ensuring Claude agents follow the ML-first strategy and role/photo conventions.

**Modified:**
- `CLAUDE.md` — Added development strategy, photo domains, user roles, and security guidelines sections
- `api/CLAUDE.md` — Added role middleware patterns and catalog photo conventions
- `web/CLAUDE.md` — Added admin route conventions and role-based UI patterns
- `ios/CLAUDE.md` — Added deferred-to-post-ML notes and CloudKit sync strategy
- `ml/CLAUDE.md` — Added Core ML conventions and catalog photo training notes

### 4. GitHub Issue Templates

Added structured issue templates to standardize how features, bugs, and tasks are created.

**Created:**
- `.github/ISSUE_TEMPLATE/feature.yml` — Feature template with phase dropdown and module selector
- `.github/ISSUE_TEMPLATE/bug.yml` — Bug report template with reproduction steps
- `.github/ISSUE_TEMPLATE/task.yml` — Task template with acceptance criteria
- `.github/ISSUE_TEMPLATE/config.yml` — Template chooser configuration

### 5. Test Scenario Scaffolding

Added planned test scenario entries and doc gate guidance for future phases.

**Modified:**
- `docs/test-scenarios/README.md` — Added scenario mapping entries for upcoming phases
- `docs/guides/DOC_GATE_REFERENCE.md` — Added guidance notes

---

## Technical Details

### Roadmap Phase Reordering

The original roadmap followed a linear feature-build approach (schema → API → iOS → ML). The ML-accelerated reordering front-loads the photo pipeline and ML training so that by the time iOS ships, the app launches with its headline feature (snap-to-identify) rather than adding it as a later update.

### Role Model Design

Three roles with additive permissions:
- `user` — browse catalog, manage own collection
- `curator` — user powers + catalog write operations (items, photos, edits)
- `admin` — curator powers + user management, role assignment

Role is embedded in JWT claims to avoid per-request DB lookups.

---

## Impact Assessment

- **Development direction**: All subsequent work follows the ML-first phase ordering
- **Agent behavior**: Updated CLAUDE.md files ensure Claude agents understand roles, photo domains, and development strategy
- **Project tracking**: Issue templates standardize how work items are created across the team

---

## Related Files

**Created (7):**
- `docs/plans/Development_Roadmap_v1_0.md`
- `docs/decisions/2026-03-16_roadmap_session_decisions.md`
- `.github/ISSUE_TEMPLATE/feature.yml`
- `.github/ISSUE_TEMPLATE/bug.yml`
- `.github/ISSUE_TEMPLATE/task.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `docs/decisions/Research_for_Toy_Collection_Catalog_and_Pricing_App.md` (minor addition)

**Modified (8):**
- `CLAUDE.md`
- `api/CLAUDE.md`
- `web/CLAUDE.md`
- `ios/CLAUDE.md`
- `ml/CLAUDE.md`
- `docs/decisions/Schema_Design_Rationale.md`
- `docs/test-scenarios/README.md`
- `docs/guides/DOC_GATE_REFERENCE.md`

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Files created | 7 |
| Files modified | 8 |
| Lines added | ~1,109 |
| Architectural decisions documented | 7 |
| Issue templates added | 3 (+1 config) |
| CLAUDE.md files updated | 5 |

---

## Status

✅ COMPLETE
