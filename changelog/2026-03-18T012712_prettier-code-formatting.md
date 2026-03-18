# Prettier Code Formatting — Monorepo-Wide Formatting Consistency

**Date:** 2026-03-18
**Time:** 01:27:12 UTC
**Type:** Infrastructure
**Version:** v0.1.0

## Summary

Added Prettier as the code formatter across the entire monorepo (api/ and web/), with eslint-config-prettier to disable conflicting ESLint rules, a pre-commit hook via husky + lint-staged, and VS Code format-on-save. A bulk format pass reformatted ~190 source files with no logic changes.

---

## Changes Implemented

### 1. Root Tooling Host

A minimal root `package.json` was introduced solely to host husky, lint-staged, and Prettier. This is NOT an npm workspace — api/ and web/ remain fully independent modules. Git only supports one pre-commit hook per repo, so husky must live at the root.

**Created:**

- `package.json` — root tooling host (husky + lint-staged + prettier)
- `package-lock.json` — lock file for root dependencies
- `.prettierrc.json` — shared formatting config (single quotes, trailing semicolons, 2-space indent, 120 print width, es5 trailing commas)
- `.prettierignore` — excludes migrations, seed JSON, generated files, iOS, lock files
- `.husky/pre-commit` — runs `npx lint-staged` on every commit
- `.git-blame-ignore-revs` — contains bulk-format commit SHA for blame exclusion

### 2. ESLint Integration

`eslint-config-prettier` added as the final entry in both ESLint flat configs, disabling all formatting-related ESLint rules so Prettier owns formatting exclusively.

**Modified:**

- `api/eslint.config.js` — import and append `prettierConfig` as last config entry
- `web/eslint.config.js` — same pattern
- `api/package.json` — added `prettier`, `eslint-config-prettier` devDeps + `format`/`format:check` scripts
- `web/package.json` — same

### 3. VS Code Workspace Settings

Format-on-save enabled for all supported file types via the multi-root workspace file.

**Modified:**

- `track-em-toys.code-workspace` — added `settings` block with `editor.formatOnSave: true` and per-language Prettier formatter overrides

### 4. eslint-disable Comment Fixes

Prettier's multiline reformatting displaced `eslint-disable-next-line no-control-regex` comments in sanitization functions. Comments were moved directly above the `.replace()` call.

**Modified:**

- `api/src/auth/routes.ts` — 2 `eslint-disable` comments repositioned
- `api/src/db/queries.ts` — 1 `eslint-disable` comment repositioned

### 5. Documentation Updates

**Modified:**

- `CLAUDE.md` — added Formatting (Prettier) section under Code Conventions, added root-level build commands
- `api/CLAUDE.md` — added `format` and `format:check` to Build Commands
- `web/CLAUDE.md` — same
- `.claude/skills/run-checks/SKILL.md` — added Format check step (step 4) to both API and Web checks, added Format column to summary table

### 6. Bulk Format

188 source files reformatted by Prettier. Changes are formatting-only (semicolons, trailing commas, line wrapping, object formatting). No logic modifications. Commit SHA recorded in `.git-blame-ignore-revs` for blame exclusion.

---

## Technical Details

### Prettier Configuration (`.prettierrc.json`)

```json
{
  "singleQuote": true,
  "semi": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 120
}
```

### Key Architecture Decisions

- **Root package.json as tooling host** — Git supports only one pre-commit hook; husky must live at root. The root package is NOT an npm workspace.
- **eslint-config-prettier v10** — compatible with both ESLint 9 (web) and ESLint 10 (api). Exports a flat config object.
- **Per-module `--ignore-path ../.prettierignore`** — Prettier does NOT auto-discover `.prettierignore` from parent directories (unlike `.prettierrc`). Per-module format scripts explicitly reference the root ignore file.
- **SQL migrations excluded** — hand-formatted with intentional vertical alignment. Seed JSON also excluded (large structured arrays with deliberate grouping).
- **Bulk format as separate commit** — SHA in `.git-blame-ignore-revs` so `git blame` skips it. GitHub reads this file natively for web blame.

### lint-staged Configuration

```json
{
  "*.{ts,tsx,js,jsx,json,md,css,yaml,yml}": ["prettier --write"]
}
```

---

## Validation & Testing

### API

- 574 tests passed (27 test files, 1 skipped integration suite)
- ESLint: zero errors, zero warnings
- TypeScript typecheck: clean
- Format check: all files formatted
- Build: successful

### Web

- 130 tests passed (15 test files)
- ESLint: clean
- TypeScript typecheck: clean
- Format check: all files formatted
- Build: successful

### Pre-commit Hook

Verified working on the first real commit — lint-staged ran Prettier on staged files automatically.

---

## Impact Assessment

- **Developer experience:** Format-on-save eliminates manual formatting. Pre-commit hook prevents unformatted code from entering the repo.
- **Code review:** Formatting debates eliminated — Prettier is the single source of truth.
- **Git blame:** Bulk format commit is excluded via `.git-blame-ignore-revs`. No historical blame pollution.
- **CI readiness:** `npm run format:check` is available in both modules for future CI pipelines. Added to `/run-checks` skill.
- **New developer onboarding:** `npm install` at repo root sets up husky automatically via the `prepare` script.

---

## Related Files

**Created:**

- `package.json` (root)
- `package-lock.json` (root)
- `.prettierrc.json`
- `.prettierignore`
- `.husky/pre-commit`
- `.git-blame-ignore-revs`

**Modified:**

- `api/eslint.config.js`, `web/eslint.config.js`
- `api/package.json`, `web/package.json`, `api/package-lock.json`, `web/package-lock.json`
- `track-em-toys.code-workspace`
- `CLAUDE.md`, `api/CLAUDE.md`, `web/CLAUDE.md`
- `.claude/skills/run-checks/SKILL.md`
- `api/src/auth/routes.ts`, `api/src/db/queries.ts` (eslint-disable fixes)
- ~188 source files (formatting only)

---

## Status

✅ COMPLETE
