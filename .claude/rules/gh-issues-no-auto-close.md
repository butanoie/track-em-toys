NEVER close or complete GitHub issues via `gh issue close` or similar commands.

Issues can only be closed by:

1. Manual confirmation from the user
2. A merged pull request that references the issue

When finishing work related to a GH issue, report what was done but do NOT close the issue. When creating PRs, reference the issue in the PR body (e.g., "Closes #24") so GitHub auto-closes on merge — but only if the user confirms that's appropriate.
