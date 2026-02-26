---
name: code-review
description: Comprehensive code review with security focus
triggers:
  - review
  - audit
  - check code
---

# Code Review Skill

You are an orchestrator for code reviews. Follow these steps:

## 1. Identify Changed Files

Run `git diff --name-only` (and `git diff --cached --name-only` for staged changes) to determine which files have been modified. If the user specifies files or a PR, use those instead.

## 2. Classify Changes by Domain

Group the changed files into domains:

| Domain | Paths | Agent |
|--------|-------|-------|
| iOS / Swift | `ios/`, `packages/TrackEmToysDataKit/` | `ios-dev` |
| API / Backend | `api/` | `backend-dev` |
| Web / React | `web/` | `react-dev` (falls back to general review if agent unavailable) |
| ML Pipeline | `ml/` | `ml-engineer` |
| Cross-cutting | Config, docs, CI, mixed | Review directly (no agent needed) |

## 3. Dispatch Domain Reviews in Parallel

For each domain with changes, spawn the corresponding agent using the Task tool with a prompt like:

> Review the following files for security vulnerabilities, performance issues, error handling gaps, and adherence to project conventions. Provide specific line references and concrete fix suggestions. Be critical but constructive.
>
> Files: [list of files in this domain]

Use `subagent_type` matching the agent name (e.g., `ios-dev`, `backend-dev`).

Launch all domain reviews in parallel — they are independent of each other.

## 4. Run Linter Check in Parallel

Always spawn the `linter` agent alongside domain reviews to catch style and naming issues across all changed files.

## 5. Summarize Results

After all agents complete, present a unified review to the user organized by severity:

1. **Security** — vulnerabilities, injection risks, secret exposure
2. **Correctness** — bugs, logic errors, missing error handling
3. **Performance** — N+1 queries, memory leaks, unnecessary re-renders
4. **Testing** — missing tests, untested edge cases
5. **Style** — naming, conventions, code organization

For each finding, include:
- File and line reference
- What the issue is
- Why it matters
- Suggested fix

If a domain has no issues, note it briefly (e.g., "API changes look good — no issues found.").

## 6. Update Agent Guidelines (Self-Improving Loop)

After presenting results, for every **Critical** or **High** severity finding:

1. Identify the domain agent whose instructions should prevent this class of issue
   (e.g. `backend-dev` for API findings, `ios-dev` for Swift findings).

2. Read the agent's instruction file (e.g. `.claude/agents/backend-dev.md`).

3. Check whether the agent's Pre-Submission Checklist already has a check that would have
   caught this finding. Look for grep commands, rules, or patterns that cover the same root cause.

4. **If no existing check covers it**, add a new numbered checklist item to the agent file:
   - Write a `bash` grep command that mechanically detects the anti-pattern (zero results = passing)
   - Add a brief rule explaining what's wrong and the correct pattern
   - Add a `### Key Pattern` code block showing correct vs. wrong usage if the pattern is non-obvious
   - Number it sequentially after the last existing item

5. Do **not** add duplicate rules. If the pattern is already covered (even partially), skip or
   extend the existing rule rather than adding a new one.

This step runs automatically after every review — no user prompt needed. It ensures each review
permanently improves the agent's ability to avoid the same class of issue in future code.
