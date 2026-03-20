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

| Value                   | Option ID |
| ----------------------- | --------- |
| 1.4 Seed                | 74e97b2b  |
| 1.5 Catalog API         | 75369da0  |
| 1.5b Roles & Admin      | fd432c26  |
| 1.7 Catalog UI          | 9faa4a41  |
| 1.9 Photos              | ec5183b7  |
| 1.9b Photo Enhancements | 5a605023  |
| 1.12 GDPR               | 4390d2cd  |
| 4.0 ML                  | 9d1743d2  |
| 2.0 iOS                 | 5a04eca1  |
| 1.6 Collection API      | e78d21c2  |
| 1.8 Collection UI       | 3784752e  |
| 1.10 CSV Import         | 8123d91b  |
| 1.11 Reporting          | 02382acf  |
| 3.0 Pricing             | dce6d4f6  |
| 5.0 Polish              | c9134170  |

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
