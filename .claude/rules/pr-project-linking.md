After creating a pull request with `gh pr create`, ALWAYS link it to the GitHub project board:

1. Add the PR to the project and capture the item ID directly:

   ```
   ITEM_ID=$(gh project item-add 4 --owner butanoie --url <PR_URL> --format json | jq -r '.id')
   ```

2. Set Status to "In Progress":
   ```
   gh project item-edit --project-id PVT_kwHODzcfkc4BR7mS --id "$ITEM_ID" \
     --field-id PVTSSF_lAHODzcfkc4BR7mSzg_nO8o --single-select-option-id 47fc9ee4
   ```

**Important:** Do NOT use `gh project item-list | grep` to find the item ID — it has propagation delays and brittle text parsing. Always capture the ID from the `item-add` response.

PRs only need Status set. Phase, Priority, Track, and Effort are tracked on the linked issue, not the PR.
