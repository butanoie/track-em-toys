# Scoped CLAUDE.md Guide

How to create and maintain directory-scoped CLAUDE.md files that augment the root governance document with location-specific conventions.

## What Are Scoped CLAUDE.md Files?

Claude Code reads `CLAUDE.md` files at every level of the project tree. The root `CLAUDE.md` contains project-wide rules. Scoped files in subdirectories add conventions specific to that area of the codebase.

### Current Scoped Files

```
track-em-toys/
├── CLAUDE.md                  # Project-wide rules (commit standards, workflow, gates)
├── api/
│   └── CLAUDE.md              # Fastify conventions, DB rules, pre-submission checklist
├── web/
│   └── CLAUDE.md              # React/TanStack conventions, ESLint config, pre-submission checklist
├── ios/
│   └── CLAUDE.md              # Swift/SwiftUI conventions, Xcode rules
├── ml/
│   └── CLAUDE.md              # Core ML / Create ML conventions
└── changelog/
    └── CLAUDE.md              # Changelog format and entry rules
```

## When to Create One

Create a scoped CLAUDE.md when:

1. **A directory has its own conventions** — Different rules than the rest of the codebase (e.g., API cookie handling is security-critical in ways that don't apply to web/)
2. **Gotchas accumulate** — You've hit the same mistake multiple times in one area (e.g., Fastify's `void reply.send()` silently suppresses errors)
3. **A new feature creates a new directory** — Capture its conventions immediately, during the post-review documentation gate

Do NOT create one when:

- The convention applies project-wide → put it in root `CLAUDE.md`
- The information is derivable from reading the code itself
- It would duplicate what's already in a `docs/guides/` file
- The directory is trivial (e.g., a `utils/` folder with two files)

## Content Styles

### "Gotchas" Style (Most Common)

Best for modules where runtime surprises are frequent — security-sensitive code, framework integration layers, testing directories.

This is the style used by `api/CLAUDE.md` and `web/CLAUDE.md`. It captures hard-won lessons that prevent regressions.

**Characteristics:**

- Pre-submission checklist with grep-based verification commands
- "Key Patterns" section with correct vs. incorrect examples
- "Refactoring Safety" section with module-specific warnings
- "Before Writing New Code" section pointing to pattern files

### "Quick Reference" Style

Best for directories where developers need fast access to commands and conventions, without deep gotcha knowledge.

This is the style used by `changelog/CLAUDE.md`. It's a concise reference card.

**Characteristics:**

- Stack/tools section
- Key commands
- Format rules or templates
- Minimal prose

### Choosing Between Styles

| Signal                                       | Style                                                      |
| -------------------------------------------- | ---------------------------------------------------------- |
| Has a pre-submission checklist with 5+ items | Gotchas                                                    |
| Security-sensitive code                      | Gotchas                                                    |
| Primarily format/template rules              | Quick Reference                                            |
| New directory, not yet battle-tested         | Quick Reference (upgrade to Gotchas as lessons accumulate) |

## Writing Tips

- **Lead with commands** — the first thing someone needs is how to build/test/lint
- **Capture the _why_, not just the _what_** — "Never use `void reply.send()`" is good; adding "it suppresses errors silently" is better
- **Include correct AND incorrect examples** — showing both makes the gotcha stick
- **Reference upstream files** — "New route handler → read `src/auth/routes.ts` for handler structure" prevents pattern drift
- **Keep it additive** — scoped files supplement root, not replace. Start with "> Supplements the root `CLAUDE.md`. Rules here are additive."

## Maintenance

Scoped CLAUDE.md files are updated at the **Post-Review Documentation Gate** (see `docs/guides/DOC_GATE_REFERENCE.md`). During this gate:

1. Review what was learned during implementation
2. Check if any "sharp edges" were encountered
3. If a new directory was created, add a scoped CLAUDE.md
4. If an existing scoped file is outdated, update it

The goal is to capture knowledge that would surprise someone editing this code later — not to duplicate what's obvious from reading the code itself.
