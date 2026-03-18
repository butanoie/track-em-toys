---
name: changelog
description: Generate a changelog entry from recent git commits using the project template
disable-model-invocation: true
---

# Changelog Generator

Generate a changelog entry from recent git activity using the format defined in `changelog/CLAUDE.md`.

## Required Input

Ask the user for:

1. **Scope** — Which commits to include (default: commits since last changelog entry)
2. **Type** — Phase Completion, Infrastructure, Feature, Configuration, Bug Fix, etc.
3. **Version** — Semantic version number (e.g., v2.5.0)

## Steps

### 1. Gather context

- Run `date '+%Y-%m-%dT%H%M%S'` for the filename timestamp
- Run `git log --oneline` since the last changelog entry (check `ls changelog/` for the most recent)
- Run `git diff --stat` against the base of those commits to understand scope
- Count files changed, lines added/removed

### 2. Draft the entry

Create the entry at `changelog/{timestamp}_{descriptive-name}.md` following the template in `changelog/CLAUDE.md`. Include all required sections:

- **Header metadata** — Date, time, type, version
- **Summary** — 2-3 sentence overview
- **Changes Implemented** — Detailed breakdown with created/modified/deleted files
- **Technical Details** — Configuration, code specifics
- **Validation & Testing** — Run `/run-checks` skill or manually run `cd api && npm test && npm run build` and `cd web && npm test && npm run lint && npm run typecheck` and include results
- **Impact Assessment** — How changes affect the project
- **Related Files** — List of key files
- **Status** — Current status

### 3. Review

Present the draft to the user for approval before writing the file.

## Output

Confirm the changelog file path and a brief summary of what was documented.
