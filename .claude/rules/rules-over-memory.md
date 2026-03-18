When saving behavioral guidance (feedback, corrections, workflow rules), prefer `.claude/rules/` over memory if the guidance applies to all developers on the project — not just the current user.

- **Rules** (`.claude/rules/*.md`): Portable, checked into git, enforced for every Claude session on this repo. Use for: workflow gates, tool restrictions, commit discipline, coding patterns.
- **Memory** (`memory/*.md`): Per-user, not in git. Use for: individual preferences, user context (role, expertise), references to external systems the user mentioned.

When in doubt, make it a rule.
