# Changelog — Entry Format and Template

> Supplements the root `CLAUDE.md`. See root for when to create changelog entries and commit standards.

## Required Sections

Every changelog entry must include:

### Header Metadata
```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Phase Completion | Infrastructure | Feature | Configuration | etc.]
**Phase:** [If applicable]
**Version:** vX.Y.Z
```

### Core Sections
1. **Summary** - Brief overview of what was accomplished (2-3 sentences)
2. **Changes Implemented** - Detailed breakdown of all changes
3. **Technical Details** - Configuration, code snippets, technical specifics
4. **Validation & Testing** - Proof that changes work (test results, quality checks)
5. **Impact Assessment** - How this affects development, team, or project
6. **Related Files** - List of created/modified/deleted files
7. **Status** - ✅ COMPLETE or current status

### Optional Sections (Use When Relevant)
- **Documentation Benefits** - How this improves documentation
- **Next Steps** - What can be done after this change
- **Future Enhancements** - Recommended improvements
- **References** - Links to documentation, guides, or external resources
- **Summary Statistics** - Numbers (files changed, tests added, coverage %, etc.)
- **Comparison** - Before/after comparisons or tool comparisons
- **Bug Fixes** - Issues resolved during implementation

---

## Best Practices

**Level of Detail:**
- Be comprehensive - changelogs are historical records
- Include specific file paths, line counts, and metrics
- Show verification results (test output, lint results, build success)
- Document configuration changes with code examples
- Explain WHY changes were made, not just WHAT changed

**Writing Style:**
- Use clear headings and subsections
- Include code blocks for examples
- Use checkmarks (✅) for completed items
- Use tables for structured data
- Include command examples with output
- Link to related documentation files

**Examples to Follow:**
- See `2026-01-25T231357_phase1-completion.md` for phase completion example
- See `2026-01-25T233843_static-analysis-documentation-enforcement.md` for infrastructure example
- See `2026-01-27T082828_testing-infrastructure-setup.md` for detailed technical example

---

## Template

```markdown
# Title - Brief Description

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS TZ
**Type:** [Type]
**Version:** vX.Y.Z

## Summary

[2-3 sentence overview]

---

## Changes Implemented

### 1. [Category]

[Detailed description]

**Created:**
- File paths and purposes

**Modified:**
- File paths and changes

---

## Technical Details

### [Subsection]

[Code examples, configuration details]

---
```
