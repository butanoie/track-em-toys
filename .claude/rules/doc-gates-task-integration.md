When creating a task list for non-trivial feature development (via /feature-dev or manual tracking), documentation gates MUST appear as explicit tasks in the task list — not just as behavioral reminders.

Required gate tasks:
1. **"Post-Architecture Documentation Gate"** — after Architecture Design, before Implementation. Blocks implementation.
2. **"Verification Gate: run /run-checks"** — after Implementation, before Quality Review.
3. **"Post-Review Documentation Gate"** — after Quality Review, before Summary. Blocks summary.

Without explicit tasks, the gates get skipped because they aren't visible in progress tracking. See `docs/guides/DOC_GATE_REFERENCE.md` for the full checklist.
