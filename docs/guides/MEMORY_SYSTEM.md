# Memory System Guide

How Claude Code's persistent memory system works in this project. Memory allows Claude to retain context across conversations — who the user is, what corrections have been given, and where to find things externally.

## Architecture

Memory lives in `~/.claude/projects/{project-slug}/memory/` and consists of:

1. **`MEMORY.md`** — An index file loaded into every conversation (keep under 200 lines)
2. **Individual memory files** — Linked from the index, containing detailed content with frontmatter

The index is a table of contents, not a data store. It contains only links and brief descriptions. Detailed content lives in the linked files.

## Categories

### Feedback Memories (Most Important)

Corrections and guidance given to the AI. Without feedback memories, the AI repeats the same mistakes across conversations.

**When to save:** Any time the user corrects the AI's approach, especially if the correction is surprising or non-obvious. Common triggers: "no not that, instead do...", "don't...", "stop doing...".

**Format:**

```markdown
---
name: no-auto-commit
description: Never commit without explicit user permission
type: feedback
---

Never commit code unless the user explicitly asks.

**Why:** The AI was completing tasks and auto-committing, which made it hard to review changes before they entered git history.

**How to apply:** After finishing implementation, wait for explicit "commit" instruction. Completing a task, passing tests, or "proceed" does NOT grant commit permission.
```

### Project Memories

Information about ongoing work, goals, and context not derivable from code or git history.

**When to save:** Architecture decisions, phase timelines, project constraints. Always convert relative dates to absolute dates (e.g., "Thursday" → "2026-03-05").

**Format:**

```markdown
---
name: phase-status
description: Current phase completion status for the authentication implementation
type: project
---

Authentication implementation phases:

- Phase 1.1 (DB migrations) — complete
- Phase 1.2 (API auth) — complete
- Phase 1.3 (Web SPA auth) — complete

**Why:** Tracks multi-phase feature progress across conversations.

**How to apply:** When the user references auth work, this gives context on what's done vs. what remains.
```

### Reference Memories

Pointers to where information lives in external systems.

**When to save:** When you learn about external tools, dashboards, or tracking systems.

**Format:**

```markdown
---
name: bug-tracker
description: Where bug reports are tracked externally
type: reference
---

Bug reports are tracked in GitHub Issues on the private repo.

**How to apply:** When the user mentions a ticket number, reference the GitHub issue. Use `gh` CLI for access (GitHub MCP server is not usable with this repo).
```

## What to Save vs. What NOT to Save

### Save

- User role, expertise level, and collaboration preferences
- Corrections to AI behavior (the "don't do X" moments)
- Architecture decisions with rationale (the _why_)
- Pointers to external systems (dashboards, trackers, docs)
- Phase completion status and project milestones

### Do NOT Save

- Code patterns or conventions — derive from reading the codebase, or put in CLAUDE.md
- Git history or recent changes — use `git log` / `git blame`
- Debugging solutions — the fix is in the code; the commit message has context
- Anything already in CLAUDE.md files (root or scoped)
- Ephemeral task details or current-conversation state

## Enforcing Workflow Rules with Memory

CLAUDE.md defines rules and workflows, but Claude doesn't always halt execution to enforce them. Memory — specifically **feedback memories** — is the mechanism that turns a CLAUDE.md guideline into a hard behavioral constraint.

### The Pattern

If a CLAUDE.md rule is critical enough that Claude should **stop and confirm** rather than silently proceed, create a feedback memory that tells Claude _how to enforce it_.

**Example: Documentation Gates**

The root `CLAUDE.md` defines two documentation gates (see `docs/guides/DOC_GATE_REFERENCE.md`). To ensure Claude actually stops at each gate instead of skipping past:

```markdown
---
name: doc-gates-enforcement
description: Documentation gates must be explicitly run during non-trivial feature work — never skip them
type: feedback
---

For non-trivial feature work, enforce the two documentation gates in `docs/guides/DOC_GATE_REFERENCE.md`:

1. **Post-Architecture Gate** — After plan approval, STOP and present the Gate 1 checklist
   before writing implementation code.
2. **Post-Review Gate** — After `/run-checks` passes, STOP and present the Gate 2 checklist
   before writing the summary.

**Why:** Without explicit enforcement, docs drift out of sync with code.

**How to apply:** Treat gates as hard blockers. Present each checklist item as done or N/A.
If the user asks to skip, confirm once before proceeding.
```

### Why This Works

- `MEMORY.md` is loaded at the **start** of every conversation — before any CLAUDE.md file is read
- Feedback memories are treated as direct user corrections, which Claude prioritizes over general instructions
- The "How to apply" field gives Claude specific behavioral instructions (stop, present checklist, wait for confirmation) rather than just stating the rule exists

### When to Use This Pattern

Use a feedback memory to enforce a rule when:

- The rule requires Claude to **halt and wait** rather than continue autonomously
- Skipping the rule has caused problems before (or would cause problems that are hard to detect)
- The rule is in CLAUDE.md but Claude has been observed ignoring or glossing over it

Do NOT use this pattern for:

- Rules that Claude already follows reliably from CLAUDE.md alone
- Conventions that are self-evident from reading the code
- One-time instructions for the current conversation only

## Maintenance

- Update or remove memories that become outdated
- Check for duplicates before creating new memories
- Keep `MEMORY.md` index concise — it loads into every conversation
- Organize semantically by topic, not chronologically
- When in doubt about whether something is a memory vs. a CLAUDE.md rule: if it governs AI behavior for _all_ future work, it's a CLAUDE.md rule; if it's context about _this project's state_, it's a memory
