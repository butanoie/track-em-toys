After creating a pull request with `gh pr create`, ALWAYS link it to the GitHub project board:

1. Add the PR to the project:

   ```
   gh project item-add 4 --owner butanoie --url <PR_URL>
   ```

2. Set Status to "In Progress":
   ```
   gh project item-edit --project-id PVT_kwHODzcfkc4BR7mS --id <ITEM_ID> \
     --field-id PVTSSF_lAHODzcfkc4BR7mSzg_nO8o --single-select-option-id 47fc9ee4
   ```

To get the item ID after adding, search the project items:

```
gh project item-list 4 --owner butanoie --limit 10 | grep "<PR_NUMBER>"
```

PRs only need Status set. Phase, Priority, Track, and Effort are tracked on the linked issue, not the PR.
