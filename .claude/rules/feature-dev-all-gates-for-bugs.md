When `/feature-dev:feature-dev` is invoked for a bug fix, the full 7-phase workflow and all gates still apply. Do not skip phases or gates because the task is a bug fix rather than a new feature.

- **Clarifying questions** — Ask about the user's environment, reproduction steps, and observed vs expected behavior before investigating
- **Architecture phase** — For bug fixes this means: present competing root cause hypotheses with evidence, get user confirmation on which to pursue before writing code
- **Verification gate** — Run `/run-checks` after the fix
- **Documentation gates** — Update docs if the fix reveals missing or incorrect documentation
- **Changelog and CLAUDE.md revision** — Still required for non-trivial bug fixes

Skipping phases leads to chasing wrong root causes and multiple incorrect fix iterations.
