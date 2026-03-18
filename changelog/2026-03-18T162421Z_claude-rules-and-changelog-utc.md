# Claude Rules, Project Board Linking & Changelog UTC Standardization

**Date:** 2026-03-18
**Time:** 16:24:21 UTC
**Type:** Infrastructure

## Summary

Added Claude rules for GitHub project board linking (issues and PRs) and a frontend-design to feature-dev workflow handoff. Fixed project board linking to capture item IDs directly from `gh project item-add --format json` instead of brittle `item-list | grep`. Standardized all 26 changelog filenames and timestamps to UTC with ISO 8601 `Z` suffix.

---

## Changes Implemented

### 1. GitHub Project Board Linking Rules

Claude rules that enforce consistent project board linking after every issue or PR creation. Include field IDs, option IDs, and step-by-step commands.

**Created:**

- `.claude/rules/issue-project-linking.md` — 4-step process: add to project (with direct ID capture), set fields, set values, apply labels/milestone
- `.claude/rules/pr-project-linking.md` — 2-step process: add to project, set Status to "In Progress"

**Modified:**

- `.github/ISSUE_TEMPLATE/feature.yml` — Fixed template formatting

### 2. Frontend-Design to Feature-Dev Handoff Rule

Ensures `/frontend-design` stays focused on design exploration and hands off to `/feature-dev:feature-dev` for implementation, so standard gates (architecture audit, doc gates, tests, `/run-checks`) are applied.

**Created:**

- `.claude/rules/frontend-design-to-feature-dev.md` — Handoff procedure, scope boundaries, and anti-patterns

### 3. Project Board Linking Fix

Replaced fragile `gh project item-list | grep` ID lookup with direct capture from `gh project item-add --format json | jq -r '.id'`. The original approach failed due to propagation delays and brittle text parsing.

**Modified:**

- `.claude/rules/issue-project-linking.md` — Collapsed add + lookup into single `--format json` call, renumbered steps
- `.claude/rules/pr-project-linking.md` — Same fix, added proper variable quoting

### 4. Changelog UTC Standardization

Converted all 26 changelog filenames and internal `**Time:**` headers to UTC. Local timezones (PST, PDT, AEDT, -0700, -0800) caused inconsistent ordering and ambiguous timestamps.

**Renamed:** 26 changelog files — 17 had timestamps converted from local to UTC, 9 already in UTC received `Z` suffix

**Modified:**

- `CLAUDE.md` — Filename format `HHMMSSZ`, generate command `date -u '+%Y-%m-%dT%H%M%SZ'`
- `changelog/CLAUDE.md` — Template `**Time:**` specifies UTC; updated stale example references to actual files
- `.claude/skills/changelog/SKILL.md` — `date -u` command
- `.claude/skills/research-catalog/SKILL.md` — `date -u` command

---

## Technical Details

### Project Board Item ID Capture

Before (failed in practice due to propagation delay):

```bash
gh project item-add 4 --owner butanoie --url <URL>
gh project item-list 4 --owner butanoie --limit 10 | grep "<NUMBER>"
```

After (ID returned immediately):

```bash
ITEM_ID=$(gh project item-add 4 --owner butanoie --url <URL> --format json | jq -r '.id')
```

### Changelog UTC Convention

- Filenames: `YYYY-MM-DDTHHMMSSZ_descriptive-name.md`
- Generate: `date -u '+%Y-%m-%dT%H%M%SZ'`
- Internal `**Time:**` headers: always `HH:MM:SS UTC`

---

## Impact Assessment

- **Project board consistency** — Every PR and issue gets linked with correct field values via reliable ID capture
- **Workflow integrity** — Frontend design work flows through the same gates as all other feature development
- **Changelog accuracy** — All timestamps are unambiguous and sort correctly regardless of contributor timezone

---

## Related Files

| File                                              | Action                                 |
| ------------------------------------------------- | -------------------------------------- |
| `.claude/rules/issue-project-linking.md`          | Created, then modified                 |
| `.claude/rules/pr-project-linking.md`             | Created, then modified                 |
| `.claude/rules/frontend-design-to-feature-dev.md` | Created                                |
| `.github/ISSUE_TEMPLATE/feature.yml`              | Modified                               |
| `CLAUDE.md`                                       | Modified                               |
| `changelog/CLAUDE.md`                             | Modified                               |
| `.claude/skills/changelog/SKILL.md`               | Modified                               |
| `.claude/skills/research-catalog/SKILL.md`        | Modified                               |
| 26 `changelog/*.md` files                         | Renamed (local tz → UTC with Z suffix) |

---

## Summary Statistics

- **Commits:** 4
- **Files changed:** 34 (3 created, 5 modified, 26 renamed)
- **Lines added:** 155
- **Lines removed:** 34

---

## Status

✅ COMPLETE
