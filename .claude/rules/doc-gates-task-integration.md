When creating a task list for non-trivial feature development (via /feature-dev or manual tracking), documentation gates MUST appear as explicit tasks in the task list — not just as behavioral reminders.

Required gate tasks:

1. **"Architecture Review & Audit"** — after Architecture Design, before documentation. Blocks documentation. Run multiple sequential review passes over the design, each from a fresh perspective. Each pass MUST cover ALL of these areas: consistency & completeness, security & auth, data model correctness, dependency conflicts & edge cases, and scope creep. After each pass, note any new issues found that previous passes missed. Continue running additional passes until NO medium-or-higher severity issues remain (max 10 passes). If all medium+ issues are resolved before 10 passes, proceed automatically to the documentation gate. If 10 passes are reached with medium+ issues still open, stop and present the unresolved issues to the user for guidance. Always present a consolidated list of all findings (including low-severity) before moving on.
2. **"Post-Architecture Documentation Gate"** — after Architecture Review & Audit passes, before Implementation. Blocks implementation.
3. **"Verification Gate: run /run-checks"** — after Implementation, before Quality Review.
4. **"Code Simplification: run code-simplifier agent"** — after Quality Review, before Post-Review Documentation Gate. Run the `code-simplifier:code-simplifier` agent on recently written code, then perform a second pass to catch anything the first pass missed. Present the combined simplification results to the user for confirmation before proceeding. A second pass that declines to apply any changes ("fixed-point reached") is a success outcome, not a failure — do not pressure the second pass to invent changes to justify the run.
5. **"Post-Review Documentation Gate"** — after Code Simplification, before Summary. Blocks summary.
6. **"Run /changelog"** — after Summary. Create a changelog entry documenting the work.
7. **"Run /claude-md-management:revise-claude-md"** — after Summary. Review session for CLAUDE.md improvements.

Without explicit tasks, the gates get skipped because they aren't visible in progress tracking. See `docs/guides/DOC_GATE_REFERENCE.md` for the full checklist.
