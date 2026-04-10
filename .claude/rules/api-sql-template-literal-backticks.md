SQL queries written as TypeScript template literals (backticked strings) MUST NOT use backticks inside SQL comments to quote identifiers like `bit_count`, `json_agg`, or `ip.dhash`.

**Why:** A backtick inside the template literal closes the outer string. The rest of the "SQL" becomes free-floating TypeScript, and ESLint's parser reports a syntax error at the stray identifier line rather than the backtick itself, making the root cause hard to spot. Hit in Phase 1.9b while adding the Hamming-distance comment to `listPendingPhotos` — the comment `\`bit_count\` requires PG14+` silently broke the query and the error pointed at `length(ip.dhash) = 16` on a completely different line. See commit `8b34307`.

**How to apply:**

- In SQL comments inside template literals, reference identifiers as plain text: `bit_count requires PG14+`, not `` `bit_count` requires PG14+ ``.
- If you really need visual emphasis, use ALL CAPS (already idiomatic for SQL keywords) or single quotes: `'bit_count' requires PG14+`. Do NOT use backticks.
- When hand-editing an existing multi-line SQL query, `npm run typecheck` is the fastest way to catch a stray backtick — the TS compiler error will point at the first identifier after the broken string boundary.
- The same rule applies to any string identifier inside the template literal body (e.g., quoted regex literals, code samples in comments). The safe rule is: no backticks inside backtick-delimited strings, period.
