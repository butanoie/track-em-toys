---
name: changelog-create
description: Create comprehensive changelog entries using a haiku sub-agent for efficient token usage
disable-model-invocation: false
allowed-tools: Task
argument-hint: [optional brief description of change]
---

# Changelog Creation with Haiku Agent

Create comprehensive changelog entries for significant project changes using a haiku sub-agent for optimal token efficiency.

## When to Use This Skill

Use `/changelog-create` for significant work that should be documented:

- ✅ **Phase Completions** - Major phase of work is complete
- ✅ **Infrastructure Changes** - New tools, frameworks, or development setup
- ✅ **Feature Additions** - New functionality or significant components
- ✅ **Breaking Changes** - Changes affecting existing functionality
- ✅ **Configuration Updates** - Major changes to build, lint, or test configuration
- ✅ **Documentation Standards** - New standards or enforcement mechanisms

**Do NOT use for:**
- ❌ Minor bug fixes
- ❌ Small refactoring
- ❌ Documentation typo fixes
- ❌ Dependency updates (unless major version bump)

## How It Works

This skill launches a specialized haiku agent to create the changelog. The haiku model is well-suited for structured documentation tasks, reducing token usage by 60-70% while maintaining comprehensive detail.

## Usage

```bash
/changelog-create
```

**With brief description:**
```bash
/changelog-create Testing infrastructure setup
```

## Token Efficiency

- **Traditional approach**: 80K-150K tokens with main model
- **Haiku agent approach**: 25K-50K tokens (60-70% reduction)
- **Quality**: Same comprehensive documentation standards

## Instructions

Launch a haiku agent to create the changelog:

```
Use the Task tool with:
- subagent_type: "general-purpose"
- model: "haiku"
- description: "Create changelog entry"
- prompt: [Detailed changelog creation instructions]
```

The agent should receive these comprehensive instructions:

---

**Changelog Creation Instructions for Agent:**

You are creating a comprehensive changelog entry for significant project changes. Follow this workflow:

## Step 1: Generate Timestamp and Filename

```bash
date '+%Y-%m-%dT%H%M%S'
```

**Create filename:** `changelog/YYYY-MM-DDTHHMMSS_descriptive-name.md`

**Descriptive name guidelines:**
- Lowercase with hyphens
- Specific but concise (3-5 words)
- Focus on WHAT was accomplished
- Examples: `testing-infrastructure-setup`, `phase1-completion`, `git-commit-haiku-agent`

## Step 2: Gather Information

Before writing, collect:
1. What was accomplished?
2. What files were created, modified, or deleted?
3. What configuration changes were made?
4. What tests or validation was performed?
5. What is the immediate and long-term impact?
6. What are next steps or future enhancements?

**Use these tools to gather information:**
- `git diff` - See recent changes
- `git log --oneline -10` - See recent commits
- `find` or `ls` - List new files/directories
- `wc -l` - Count lines in files
- Review test output, lint results, build logs

## Step 3: Create Changelog File

**Location:** `changelog/YYYY-MM-DDTHHMMSS_descriptive-name.md`

### Required Header Metadata

```markdown
# [Title] - [Brief Description]

**Date:** YYYY-MM-DD
**Time:** HH:MM:SS PST
**Type:** [Type from list]
**Phase:** [If applicable]
**Version:** vX.Y.Z
```

**Types:**
- Phase Completion
- Infrastructure Enhancement
- Feature Addition
- Configuration Update
- Breaking Change
- Documentation Standards
- Development Standards Implementation
- Performance Optimization
- Security Enhancement

### Required Section 1: Summary

Write 2-3 sentences answering:
- What was accomplished?
- Why was it important?
- What is the key outcome?

```markdown
## Summary

[2-3 sentence overview]
```

### Required Section 2: Changes Implemented

Break down ALL changes into categories with subsections:

```markdown
## Changes Implemented

### 1. [Category Name]

**[Subcategory]**
- Specific changes with versions and details

**Created:**
- `path/to/file.ext` - Purpose (X lines)

**Modified:**
- `path/to/file.ext` - What changed

**Configuration:**
```language
// Code examples
```
```

**Common categories:**
- Dependencies Installation
- Configuration Files Created
- Directory Structure
- Implementation Details
- NPM Scripts Added
- Documentation Updates

### Required Section 3: Technical Details

Include detailed technical information:

```markdown
## Technical Details

### [Subsection]

[Explanation of technical decisions]

```language
// Configuration code snippets
// File content examples
```

**Key Points:**
- Important detail 1
- Important detail 2
```

### Required Section 4: Validation & Testing

**CRITICAL:** Prove that changes work by showing actual command output:

```markdown
## Validation & Testing

### Quality Checks - All Passing ✅

**TypeScript Compilation:**
```bash
$ npm run type-check
[Show actual output]
✅ Result
```

**ESLint Validation:**
```bash
$ npm run lint
[Show actual output]
✅ Result
```

**Tests:**
```bash
$ npm test
[Show actual output]
✅ Result
```
```

**Run these commands and include ACTUAL output:**
- `npm run type-check` or `tsc --noEmit`
- `npm run lint`
- `npm test` or `npm run test:unit`
- `npm run build` (if applicable)

### Required Section 5: Impact Assessment

Describe short and long-term impact:

```markdown
## Impact Assessment

### Immediate Impact
- ✅ Impact item 1
- ✅ Impact item 2

### Development Workflow Impact
- **Before:** Old workflow
- **During:** Transition steps
- **After:** New workflow

### Long-term Benefits
- 🔒 **Prevents:** Problems this prevents
- 📊 **Measures:** Metrics this provides
- 🚀 **Enables:** New capabilities this unlocks
```

### Required Section 6: Related Files

List ALL files affected:

```markdown
## Related Files

### Created Files (N)
1. **`path/file.ext`** - Description (X lines)

### Modified Files (N)
1. **`path/file.ext`** - Changes made

### Generated Directories (N)
1. **`path/dir/`** - Purpose
```

**Get file line counts:**
```bash
wc -l path/to/file.ext
```

### Optional Section: Summary Statistics

Provide measurable metrics:

```markdown
## Summary Statistics

- **Files Created:** N
- **Files Modified:** N
- **Lines Added:** ~N
- **Tests Added:** N
- **Coverage:** X%
- **NPM Packages:** N
```

### Optional Section: References

Link related documentation:

```markdown
## References

- **Documentation:** `path/to/docs.md`
- **External:** [Name](https://url.com)
- **Related Changelog:** `changelog/timestamp_name.md`
```

### Required: Status and Final Summary

```markdown
---

**Status:** ✅ COMPLETE

[One sentence final summary of accomplishment and significance]
```

## Quality Standards

Your changelog must be:

### Comprehensive
- Include ALL files, configurations, and changes
- Don't assume readers know context
- Think "future developer reading this in 6 months"

### Evidence-Based
- Show actual test output, not just "tests pass"
- Include real command results
- Prove changes work

### Well-Structured
- Use clear headings and subsections
- Tables for structured data
- Code blocks for examples
- Bullet points for lists
- Checkmarks (✅) for completed items

### Explanatory
- Explain WHY changes were made
- Provide context and reasoning
- Don't just list WHAT changed

### Accurate
- Use correct timestamps
- Count files and lines accurately
- Verify all information

## Quality Checklist

Before finalizing, verify:

- [ ] Filename uses correct timestamp format
- [ ] Header metadata is complete
- [ ] Summary is clear and concise (2-3 sentences)
- [ ] Changes Implemented lists ALL changes
- [ ] Technical Details include code examples
- [ ] Validation & Testing shows ACTUAL command output
- [ ] Impact Assessment describes effects
- [ ] Related Files lists ALL affected files
- [ ] Summary Statistics provides metrics
- [ ] Status is marked (✅ COMPLETE)
- [ ] Final summary statement present

## Reference Examples

Review these excellent examples:
- `changelog/2026-01-27T082828_testing-infrastructure-setup.md` (650+ lines, very thorough)
- `changelog/2026-01-25T233843_static-analysis-documentation-enforcement.md` (well-structured)
- `changelog/2026-01-25T231357_phase1-completion.md` (good phase template)

## Common Mistakes to Avoid

❌ Too brief - needs comprehensive detail
❌ Missing files - must list all created/modified files
❌ No validation - must show proof changes work
❌ No impact - must explain why this matters
❌ Poor formatting - use structure and headings
❌ Incorrect timestamp - use proper format
❌ Missing status - must have final status marker

## Tips for Success

1. **Be thorough** - This is a permanent historical record
2. **Show your work** - Include actual command output
3. **Use code blocks** - Show configurations and examples
4. **Count accurately** - Verify file counts and line numbers
5. **Explain reasoning** - Future readers need context
6. **Make it scannable** - Use headings, bullets, tables
7. **Verify everything** - Run commands to get accurate output

## After Creating Changelog

1. Save the file to `changelog/` directory
2. Verify it follows all quality standards
3. Consider referencing it in commit messages
4. The changelog is now part of permanent project history

---

**Remember:** Changelogs document project evolution. Be comprehensive, accurate, and clear!
