When creating a task list for non-trivial feature development (via /feature-dev or manual tracking), documentation gates MUST appear as explicit tasks in the task list — not just as behavioral reminders.

Required gate tasks:

1. **"Architecture Review & Audit"** — after Architecture Design, before documentation. Blocks documentation. Review the design for consistency, security, data model correctness, dependency conflicts, edge cases, and scope creep.
2. **"Post-Architecture Documentation Gate"** — after Architecture Review & Audit passes, before Implementation. Blocks implementation.
3. **"Verification Gate: run /run-checks"** — after Implementation, before Quality Review.
4. **"Post-Review Documentation Gate"** — after Quality Review, before Summary. Blocks summary.
5. **"Run /changelog"** — after Summary. Create a changelog entry documenting the work.
6. **"Run /claude-md-management:revise-claude-md"** — after Summary. Review session for CLAUDE.md improvements.

Without explicit tasks, the gates get skipped because they aren't visible in progress tracking. See `docs/guides/DOC_GATE_REFERENCE.md` for the full checklist.
