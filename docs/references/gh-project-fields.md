# GitHub Project Board Field IDs

Project ID: `PVT_kwHODzcfkc4BR7mS`
Project number: `4`
Owner: `butanoie`

## Adding items to the project

```
ITEM_ID=$(gh project item-add 4 --owner butanoie --url <URL> --format json | jq -r '.id')
```

**Important:** Do NOT use `gh project item-list | grep` to find the item ID — it has propagation delays and brittle text parsing. Always capture the ID from the `item-add` response.

## Setting fields

```
gh project item-edit --project-id PVT_kwHODzcfkc4BR7mS --id <ITEM_ID> \
  --field-id <FIELD_ID> --single-select-option-id <OPTION_ID>
```

### Field IDs

| Field    | Field ID                         |
| -------- | -------------------------------- |
| Status   | `PVTSSF_lAHODzcfkc4BR7mSzg_nO8o` |
| Priority | `PVTSSF_lAHODzcfkc4BR7mSzg_nPAQ` |
| Phase    | `PVTSSF_lAHODzcfkc4BR7mSzg_nPAU` |
| Track    | `PVTSSF_lAHODzcfkc4BR7mSzg_nPAw` |
| Effort   | `PVTSSF_lAHODzcfkc4BR7mSzg_nPAY` |

### Status

| Value       | Option ID |
| ----------- | --------- |
| Todo        | f75ad846  |
| In Progress | 47fc9ee4  |
| Done        | 98236657  |

### Priority

| Value    | Option ID |
| -------- | --------- |
| Critical | 1cd889a8  |
| High     | a7cb8ec5  |
| Medium   | 8c1927b3  |
| Low      | 1f5da5ad  |

### Phase

| Value              | Option ID |
| ------------------ | --------- |
| 1.4 Seed           | b093ae15  |
| 1.5 Catalog API    | f3ce6de3  |
| 1.5b Roles & Admin | 08508f52  |
| 1.7 Catalog UI     | 4de93c31  |
| 1.9 Photos         | 422665a3  |
| 1.12 GDPR          | afe95509  |
| 4.0 ML             | da0a83fc  |
| 2.0 iOS            | f517f05c  |
| 1.6 Collection API | d48fbcc5  |
| 1.8 Collection UI  | 1486b874  |
| 1.10 CSV Import    | 8a2dc389  |
| 1.11 Reporting     | dea7d4a2  |
| 3.0 Pricing        | 5705530f  |
| 5.0 Polish         | 6e677cfb  |

### Track

| Value   | Option ID |
| ------- | --------- |
| ML Path | ed72bc4e  |
| Post-ML | 60752499  |
| Backlog | 8d7cc674  |

### Effort

| Value     | Option ID |
| --------- | --------- |
| XS (< 2h) | 6831a86a  |
| S (2-4h)  | 40f3ec98  |
| M (4-8h)  | a13661c4  |
| L (1-2d)  | 9eaff376  |
| XL (3-5d) | a87135ab  |

## Labels and Milestones (for issues)

- **Labels:** Use `--label` flags on `gh issue create`. Common labels: module (`api`, `web`, `ios`, `ml`), type (`type:feature`, `type:bug`, `type:chore`, `type:test`, `type:docs`), phase (`phase:X.Y`), priority (`priority:*`)
- **Milestone:** Use `--milestone` flag. Milestones match phases (e.g., `1.5 Catalog API (Read)`, `1.5b User Roles & Admin`)
