# Migrate Domain Agent Checklists to Per-Directory CLAUDE.md Files

**Date:** 2026-02-27
**Time:** 07:44:44 UTC
**Type:** Infrastructure
**Phase:** N/A — Cross-cutting developer tooling

## Summary

Migrated project-specific pre-submission checklists and code patterns from custom agent files (`.claude/agents/`) into per-directory `CLAUDE.md` files that Claude Code automatically inherits based on working directory context. Deleted 9 custom agent files and 2 custom skill files, replaced by 5 new domain-specific CLAUDE.md files. Enabled 17 official Claude Code plugins. Also added an integration testing strategy document.

---

## Changes Implemented

### 1. Per-Directory CLAUDE.md Files (Created)

Extracted domain-specific rules from monolithic agent definitions into focused, directory-scoped instruction files:

| File                  | Pre-Submission Checks | Key Patterns              | Lines                          |
| --------------------- | --------------------- | ------------------------- | ------------------------------ |
| `api/CLAUDE.md`       | 27 checks             | 14 patterns               | 402                            |
| `web/CLAUDE.md`       | 14 checks             | 3 patterns                | 194                            |
| `ios/CLAUDE.md`       | 8 checks              | 3 patterns                | ~51 (migrated from ios-dev.md) |
| `ml/CLAUDE.md`        | 6 checks              | 2 patterns                | 105                            |
| `changelog/CLAUDE.md` | N/A                   | Template + best practices | 101                            |

### 2. Custom Agents Deleted

Removed 9 agent files and 2 skill files from `.claude/`:

**Agents deleted:**

- `.claude/agents/architect/AGENT.md` — system architecture agent
- `.claude/agents/backend-dev.md` — Node.js/Fastify backend agent (787 lines)
- `.claude/agents/code-reviewer.md` — code review agent
- `.claude/agents/commit-writer.md` — commit message agent
- `.claude/agents/diff-summerizer.md` — diff summary agent
- `.claude/agents/linter.md` — linting agent
- `.claude/agents/ml-engineer.md` — ML pipeline agent
- `.claude/agents/react-dev.md` — React/web frontend agent (282 lines)
- `.claude/agents/researcher.md` — research agent
- `.claude/agents/ios-dev.md` — migrated to `ios/CLAUDE.md`

**Skills deleted:**

- `.claude/skills/changelog-create/SKILL.md` — changelog creation skill (396 lines)
- `.claude/skills/code-review/SKILL.md` — code review skill

### 3. Root CLAUDE.md Refinements

- Added `Build (API): cd api && npm run build` to build commands
- Removed redundant **Project Structure** and **CRITICAL RULES** sections (covered by per-directory files)
- Moved 120-line changelog template to `changelog/CLAUDE.md`
- Reduced from 285 → 181 lines (37% reduction)

### 4. Claude Code Plugin Configuration

Enabled 17 official plugins in `.claude/settings.json`:

- `github`, `context7`, `code-review`, `feature-dev`, `code-simplifier`
- `typescript-lsp`, `playwright`, `commit-commands`, `pr-review-toolkit`
- `claude-md-management`, `security-guidance`, `claude-code-setup`
- `explanatory-output-style`, `skill-creator`, `frontend-design`

### 5. Infrastructure Additions

- `.gitignore` — added `.claude/agents.bak/` and `.claude/skills.bak/` exclusions for backup directories
- `.mcp.json` — removed stale MCP server configuration
- `docs/Integration_Testing_Strategy_2026.md` — new integration testing strategy document (298 lines)

---

## Technical Details

### Why Per-Directory CLAUDE.md Over Custom Agents

Claude Code has a built-in inheritance model: when working in a subdirectory (e.g., `api/`), it automatically loads both the root `CLAUDE.md` and any `CLAUDE.md` in that directory. This means:

1. **Automatic context** — No need to explicitly invoke an agent; the domain rules are always active when editing files in that directory
2. **Composable** — Root CLAUDE.md provides shared rules (commit standards, security guidelines), directory files add domain-specific checks
3. **Discoverable** — CLAUDE.md files are version-controlled, visible in the repo, and readable by any contributor
4. **Reduced maintenance** — One canonical location per domain instead of duplicated rules across agent files

### Checklist Coverage by Domain

**API (27 checks):** Tests/lint, TypeScript build, plugin signatures, response schema completeness, no `SELECT *`, signed cookie reads, type assertions, no void on sync calls, provider aud normalization, HttpError transaction scoping, schema/type alignment, DB CHECK constraints, string sanitization, named constants for column widths, RLS wrapper usage, UPDATE/DELETE rowCount, duration constants, HTTP status semantics, route response schema accuracy, integration test coverage, security audit logging, URL sanitization, env config typing, rate limiting, email_verified upgrade path, test non-null assertions, companion test files

**Web (14 checks):** Tests, lint, typecheck, no `any` leaks, test relaxation boundaries, async handler wrapping, path alias consistency, auth token storage, router config separation, QueryClient instantiation, TanStack Router patterns, Zod schema validation, component export patterns, accessibility basics

**iOS (8 checks):** Build verification, Swift 6 concurrency, SwiftUI-only enforcement, SwiftData patterns, async/await usage, SF Symbols, deployment target, no .pbxproj modifications

**ML (6 checks):** Model size limits, Create ML patterns, transfer learning validation, Core ML integration, dataset pipeline, model versioning

---

## Summary Statistics

| Metric                   | Value                 |
| ------------------------ | --------------------- |
| Files deleted            | 11                    |
| Files created            | 6                     |
| Files modified           | 3                     |
| Total files changed      | 21                    |
| Lines added              | +1,140                |
| Lines removed            | −2,026                |
| Net change               | −886 lines            |
| Plugins enabled          | 17                    |
| Root CLAUDE.md reduction | 37% (285 → 181 lines) |

---

## Impact Assessment

- **Developer experience:** Domain rules are now always-on context rather than opt-in agent invocations. No need to remember which agent to use — work in a directory and the rules follow.
- **Consistency:** All agents previously had slightly divergent copies of shared rules (e.g., commit standards, security guidelines). Now there's one root CLAUDE.md for shared rules, with domain files for specifics.
- **Onboarding:** New contributors can read the CLAUDE.md in any directory to understand that domain's conventions, checks, and patterns without navigating `.claude/agents/`.
- **Plugin ecosystem:** Enabling 17 official plugins provides built-in capabilities (code review, PR toolkit, frontend design) that replace functionality previously hand-coded in custom agent/skill files.

---

## Related Files

| File                                        | Action                                              |
| ------------------------------------------- | --------------------------------------------------- |
| `api/CLAUDE.md`                             | Created                                             |
| `web/CLAUDE.md`                             | Created                                             |
| `ios/CLAUDE.md`                             | Created (migrated from `.claude/agents/ios-dev.md`) |
| `ml/CLAUDE.md`                              | Created                                             |
| `changelog/CLAUDE.md`                       | Created                                             |
| `docs/Integration_Testing_Strategy_2026.md` | Created                                             |
| `CLAUDE.md`                                 | Modified — trimmed 37%                              |
| `.claude/settings.json`                     | Modified — 17 plugins enabled                       |
| `.gitignore`                                | Modified — backup dir exclusions                    |
| `.mcp.json`                                 | Deleted                                             |
| `.claude/agents/architect/AGENT.md`         | Deleted                                             |
| `.claude/agents/backend-dev.md`             | Deleted                                             |
| `.claude/agents/code-reviewer.md`           | Deleted                                             |
| `.claude/agents/commit-writer.md`           | Deleted                                             |
| `.claude/agents/diff-summerizer.md`         | Deleted                                             |
| `.claude/agents/linter.md`                  | Deleted                                             |
| `.claude/agents/ml-engineer.md`             | Deleted                                             |
| `.claude/agents/react-dev.md`               | Deleted                                             |
| `.claude/agents/researcher.md`              | Deleted                                             |
| `.claude/skills/changelog-create/SKILL.md`  | Deleted                                             |
| `.claude/skills/code-review/SKILL.md`       | Deleted                                             |

---

## Status

✅ COMPLETE
