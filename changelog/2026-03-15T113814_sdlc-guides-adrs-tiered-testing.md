# SDLC Guides, ADRs, Tiered Testing, and Secrets Hook

**Date:** 2026-03-15
**Time:** 11:38:14 PDT
**Type:** Documentation Standards
**Phase:** Phase 5 — Account Linking, Webhooks, and Hardening
**Version:** v0.5.1

## Summary

Major documentation overhaul: reorganized docs/ into categorized subdirectories, expanded all READMEs, moved module-specific CLAUDE.md rules into scoped files, added six SDLC guides, converted two recommendation documents to ADR format, enforced tiered testing requirements, and added a PreToolUse hook blocking access to secret files.

---

## Changes Implemented

### 1. CLAUDE.md Reorganization

**Modified:**
- `CLAUDE.md` — moved module-specific rules (iOS, API, Web conventions, build commands, type safety) into per-module scoped files; added refactoring safety rules, feature development gates (verification, post-architecture docs, post-review docs)
- `api/CLAUDE.md` — expanded with API-specific build commands (typecheck, lint, lint:fix), integration test coverage checklist, refactoring rules
- `web/CLAUDE.md` — expanded with web-specific conventions, E2E test instructions, refactoring rules
- `ios/CLAUDE.md` — expanded with iOS-specific rules and refactoring safety

### 2. README Expansion

**Created:**
- `web/README.md` — setup instructions, tech stack, project structure, key conventions
- `ios/README.md` — Xcode setup, architecture, development workflow
- `ml/README.md` — Core ML pipeline overview and planned approach
- `docs/README.md` — categorized index with document status tracking

**Modified:**
- `README.md` — rewritten from 2-line stub to full monorepo overview with structure, prerequisites, quick start, dev commands, and project status
- `api/README.md` — PostgreSQL 15+ → 17+, added missing endpoints (GET /auth/me, POST /auth/webhooks/apple, GET /docs), added webhooks.ts, cookies.ts, errors.ts, docs.ts to project structure

### 3. Docs Reorganization

**Moved/Reorganized:**
- `docs/` reorganized into subdirectories: `requirements/`, `decisions/`, `plans/`, `guides/`, `diagrams/`
- All cross-references updated to match new paths

### 4. ADR Conversions

**Created:**
- `docs/decisions/ADR_Frontend_Framework.md` — trimmed 320→107 lines, retaining decision rationale, comparison table, architectural constraints
- `docs/decisions/ADR_Integration_Testing_Strategy.md` — trimmed 299→107 lines to focused ADR format

**Deleted:**
- `docs/Frontend_Framework_Recommendation_2026.md`
- `docs/Integration_Testing_Strategy_2026.md`

### 5. SDLC Guides

**Created:**
- `docs/guides/DOC_GATE_REFERENCE.md` — standalone doc gate checklists with memory update step
- `docs/guides/TSDOC_STANDARDS.md` — JSDoc/TSDoc templates for Fastify, React, Zod
- `docs/guides/MEMORY_SYSTEM.md` — memory categories, enforcement pattern for workflow rules
- `docs/guides/SCOPED_CLAUDE_MD.md` — when/how to create directory-scoped CLAUDE.md files
- `docs/guides/TESTING_SCENARIOS.md` — scenario-driven testing with Gherkin as docs, not tooling
- `docs/test-scenarios/README.md` — scenario-to-spec mapping table

### 6. Tiered Testing Requirements

**Modified:**
- `CLAUDE.md` Testing Requirements — expanded from "write unit tests" to tiered model: unit (always), integration (API routes/DB), E2E (user flows), test scenarios (non-trivial features)
- Gate 1 checklist updated to include test scenario writing
- Gate 2 checklist updated to include test scenario sync and coverage verification

### 7. Security Hooks

**Created:**
- `.claude/settings.json` — PreToolUse hooks blocking access to `.pem`, `.key`, `.p12`, `.pfx`, `secrets/`, `credentials/` files
- `.claude/agents/a11y-reviewer.md` — accessibility review agent definition
- `.claude/skills/changelog/SKILL.md` — changelog creation skill
- `.claude/skills/run-checks/SKILL.md` — pre-submission verification skill

---

## Technical Details

### PreToolUse Secrets Hook

The settings file adds a hook that intercepts Read, Write, and Edit tool calls and blocks any path matching sensitive file patterns:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "..." // blocks .pem, .key, .p12, .pfx, secrets/, credentials/
        }]
      }
    ]
  }
}
```

### Tiered Testing Model

| Layer | When Required | Location |
|-------|--------------|----------|
| Unit | Always | Co-located `*.test.ts` |
| Integration | API routes, DB queries | `src/**/*.test.ts` with `fastify.inject()` |
| E2E | User-facing flows | `web/e2e/*.spec.ts` |
| Scenarios | Non-trivial features | `docs/test-scenarios/` |

---

## Impact Assessment

- **Developer experience:** Scoped CLAUDE.md files reduce noise when working in a single module — only relevant rules are loaded
- **Documentation discoverability:** Categorized docs/ subdirectories with an index make it easy to find existing documentation
- **Quality enforcement:** Tiered testing requirements and doc gates create a structured workflow that catches gaps before they reach review
- **Security:** Secrets hook prevents accidental exposure of private keys and credentials through Claude Code

## Related Files

**Created (14 files):**
- `.claude/agents/a11y-reviewer.md`, `.claude/settings.json`, `.claude/skills/changelog/SKILL.md`, `.claude/skills/run-checks/SKILL.md`
- `docs/README.md`, `docs/decisions/ADR_Frontend_Framework.md`, `docs/decisions/ADR_Integration_Testing_Strategy.md`
- `docs/guides/DOC_GATE_REFERENCE.md`, `docs/guides/MEMORY_SYSTEM.md`, `docs/guides/SCOPED_CLAUDE_MD.md`, `docs/guides/TESTING_SCENARIOS.md`, `docs/guides/TSDOC_STANDARDS.md`
- `docs/test-scenarios/README.md`
- `web/README.md`, `ios/README.md`, `ml/README.md`

**Modified (8 files):**
- `CLAUDE.md`, `README.md`, `api/CLAUDE.md`, `api/README.md`, `ios/CLAUDE.md`, `web/CLAUDE.md`
- `docs/plans/User_Authentication_Implementation_Plan.md`, `docs/plans/iOS_Authentication_Architecture_Blueprint.md`

**Deleted (2 files):**
- `docs/Frontend_Framework_Recommendation_2026.md`, `docs/Integration_Testing_Strategy_2026.md`

## Summary Statistics

- 30 files changed, +1,905 lines, −721 lines (net +1,184)
- 14 new files created, 2 deleted, 8 modified
- 6 new SDLC guides, 2 ADR conversions, 4 new READMEs

## Status

✅ COMPLETE
