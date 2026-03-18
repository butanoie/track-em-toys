---
name: run-checks
description: Run pre-submission verification checks across API and Web modules — tests, lint, typecheck, format, and build
---

# Run Checks

Run the automated pre-submission checks for the API and Web modules. Report pass/fail for each step.

## Instructions

Run the following checks **in order** for each module. Stop a module's checks on the first failure but continue to the next module. Use `2>&1 | tail -20` to keep output concise.

### API Checks

```bash
cd /Users/buta/Repos/track-em-toys/api

# 1. Tests + lint (npm test runs vitest AND eslint)
npm test 2>&1 | tail -20

# 2. TypeScript type-check
npm run typecheck 2>&1 | tail -10

# 3. TypeScript type-check
npm run typecheck 2>&1 | tail -10

# 4. Format check (Prettier)
npm run format:check 2>&1 | tail -10

# 5. Build
npm run build 2>&1 | tail -10
```

### Web Checks

```bash
cd /Users/buta/Repos/track-em-toys/web

# 1. Unit tests
npm test 2>&1 | tail -20

# 2. Lint
npm run lint 2>&1 | tail -10

# 3. TypeScript type-check
npm run typecheck 2>&1 | tail -10

# 4. Format check (Prettier)
npm run format:check 2>&1 | tail -10

# 5. Build
npm run build 2>&1 | tail -10
```

## Output Format

After running all checks, present a summary table:

```
| Module | Tests | Lint | Typecheck | Format | Build |
|--------|-------|------|-----------|--------|-------|
| API    | ✅/❌  | ✅/❌ | ✅/❌      | ✅/❌   | ✅/❌  |
| Web    | ✅/❌  | ✅/❌ | ✅/❌      | ✅/❌   | ✅/❌  |
```

If any check failed, show the relevant error output below the table.

## Notes

- API `npm test` combines vitest AND eslint (`--max-warnings 0`), so a single run covers both tests and lint.
- Web lint and tests are separate scripts.
- Do NOT run E2E tests (`npm run test:e2e`) — those require a running API server and are run separately.
- Do NOT run iOS checks — those require Xcode and are handled via the xcodebuild MCP.
