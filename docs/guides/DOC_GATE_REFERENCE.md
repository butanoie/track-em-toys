# Documentation Gate Reference

Standalone reference for the mandatory documentation gates in the feature development workflow. Link this file from task descriptions so Claude can reference it during execution.

---

## Gate 1: Post-Architecture (After Plan Approval, Before Implementation)

**Trigger:** Architecture/plan has been approved by the user.
**Blocks:** Implementation cannot start until this gate passes.

### Checklist

- [ ] **Design docs** (`docs/plans/` or `docs/decisions/`) — Update or create with confirmed decisions, refined scope, and technical constraints
- [ ] **Guides** (`docs/guides/`) — Update if new patterns or conventions are introduced
- [ ] **CLAUDE.md** — Add new conventions that apply project-wide to root, or module-specific conventions to scoped CLAUDE.md files (`api/CLAUDE.md`, `web/CLAUDE.md`, `ios/CLAUDE.md`)
- [ ] **GitHub issues** — Post a comment syncing the latest decisions and technical notes (if applicable)

### How to Apply

Review each item explicitly. If an item is not applicable (e.g., no new conventions emerged), note it as N/A and move on. The goal is to ensure no documentation debt accumulates before code is written.

**Common mistakes:**
- Skipping this gate because "it's a small feature" — if the feature went through architecture review, it goes through the doc gate
- Updating only the root CLAUDE.md when the convention is module-specific — use scoped files
- Writing vague plan docs — include specific file paths, function signatures, and data flow descriptions

---

## Gate 2: Post-Review (After Quality Review Passes, Before Summary)

**Trigger:** Review issues have been fixed and `/run-checks` passes.
**Blocks:** Summary cannot be written until this gate passes.

### Checklist

- [ ] **Sync architecture docs** — Update `docs/plans/` and `docs/decisions/` to reflect what was actually built, not what was planned. Note scope changes and deferred work.
- [ ] **Capture learnings** — Record gotchas and conventions into the appropriate location:
  - New directory with its own conventions → create a scoped CLAUDE.md
  - Module-specific lesson → update `api/CLAUDE.md`, `web/CLAUDE.md`, or `ios/CLAUDE.md`
  - Project-wide lesson → update root `CLAUDE.md`
  - Focus on "sharp edges" — things that would surprise someone editing this code later
- [ ] **Roadmap items** — Check off completed items in any active plan docs
- [ ] **Update memory** — Review what was learned and update persistent memory as needed (see `docs/guides/MEMORY_SYSTEM.md` for categories and format):
  - **Project memory** — Update phase status, milestone completions, or newly discovered constraints
  - **Feedback memory** — If the user corrected Claude's approach during this feature, save the correction so it isn't repeated
  - **Reference memory** — If a new external system, dashboard, or tracking tool was introduced, save a pointer
  - Check existing memories for staleness — remove or update any that this feature invalidates (e.g., test counts, phase status)

### How to Apply

The post-review gate catches the gap between "what we planned" and "what we actually built." Implementation always deviates from architecture — this gate ensures documentation reflects reality, not the plan.

**Common mistakes:**
- Leaving plan docs in "planned" state when the feature is already built — update status fields
- Not recording workarounds or surprising behavior — these are the most valuable learnings
- Adding conventions to the wrong scope — a lesson about Fastify cookie handling belongs in `api/CLAUDE.md`, not root
- Forgetting to update memory — if the user corrected your approach, that correction will be lost in the next conversation unless saved as a feedback memory
- Leaving stale memory entries — if a feature changed phase status or test counts, update existing project memories rather than creating duplicates

---

## Verification Gate

**Trigger:** Implementation is complete, or review fixes have been applied.
**Blocks:** Proceeding to the next phase until all checks pass.

### Checklist

- [ ] Run `/run-checks` — all modules must pass tests, lint, typecheck, and build
- [ ] If checks fail, fix the issues and re-run — do not proceed with failures
- [ ] Run module-specific pre-submission checklists (see `api/CLAUDE.md` and `web/CLAUDE.md`)

### When to Run

- After completing implementation (before review)
- After fixing review issues (before doc gate 2)
- Before considering any task done
