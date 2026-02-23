---
name: git-commit
description: Commit changes using a haiku sub-agent for efficient token usage
disable-model-invocation: false
allowed-tools: Task
argument-hint: [optional commit message guidance]
---

# Git Commit with Haiku Agent

Execute a complete git commit workflow using a haiku sub-agent for optimal token efficiency.

## How It Works

This skill launches a specialized haiku agent to handle the git commit process. The haiku model is perfect for structured tasks like git operations, reducing token usage by 60-70% compared to the main model.

## Workflow

The haiku agent will:

1. **Check Status & Review Changes**
   - Run `git status` to see all files (never use -uall flag)
   - Run `git diff --staged` and `git diff` to review changes
   - Run `git log --oneline -10` to understand commit message style

2. **Verify Documentation Requirements**
   - **CRITICAL**: All code changes must be properly documented
   - Functions need JSDoc/TSDoc with purpose, parameters, returns
   - Classes need documentation explaining responsibility
   - Interfaces/types need comments explaining purpose
   - Complex logic needs inline comments explaining "why"
   - If documentation is missing: STOP, add it, then commit

3. **Stage Files**
   - If $ARGUMENTS provided: stage those specific files
   - If empty: analyze changes and stage relevant files
   - Prefer specific file names over `git add .` or `git add -A`

4. **Create Commit Message**
   - Analyze changes and draft appropriate message
   - Follow repository's commit message style
   - Format: Brief subject (50 chars) + detailed body
   - Use imperative mood ("Add feature" not "Added feature")
   - Explain the "why" not just the "what"

5. **Commit & Verify**
   - Use heredoc for proper message formatting
   - Verify success with `git status`
   - Never skip hooks or use `--no-verify`

## Usage Examples

**Commit all changes:**
```
/git-commit
```

**Commit with guidance:**
```
/git-commit Fix authentication bug
```

**Commit specific files:**
```
/git-commit Add user profile feature
```

## Instructions

Launch the custom git-commit agent to perform the git commit:

```
Use the Task tool with:
- subagent_type: "git-commit"
- description: "Create git commit"
- prompt: [Brief commit instructions]
```

The git-commit agent has been configured with:
- ✅ System prompt with all commit guidelines
- ✅ Documentation validation requirements
- ✅ Conventional commits format
- ✅ Quality standards and best practices

**Pass these instructions to the agent:**

---

**Git Commit Instructions:**

Execute a git commit following this workflow:

1. **Review Changes** - Run in parallel:
   ```bash
   git status
   git diff --staged
   git diff
   git log --oneline -10
   ```

2. **Verify Documentation Requirements**
   - All new code must have JSDoc/TSDoc comments
   - Functions: purpose, parameters, return value
   - Classes/interfaces: responsibility and purpose
   - Complex logic: inline comments explaining "why"
   - **STOP and report** if documentation is missing

3. **Stage Files**
   - Use `$ARGUMENTS` if provided (specific files)
   - Otherwise: stage relevant files by name
   - Avoid `git add .` or `git add -A`

4. **Create Commit Message**
   - Follow repository's commit style (from git log)
   - Subject: imperative, ≤50 chars
   - Body: explain why, wrap at 72 chars
   - Include `Closes #N` for related issues
   - Use heredoc format for message

5. **Verify Success**
   ```bash
   git log -1 --pretty=format:"%h %s%n%n%b"
   git status
   ```

**Rules:**
- Documentation is mandatory - treat missing docs as a blocker
- Never push unless explicitly requested
- Never use `--amend` or `--no-verify`
- Keep commits atomic and focused

---

## Token Efficiency

- **Traditional approach**: ~60K-100K tokens with main model
- **Haiku agent approach**: ~15K-30K tokens (60-70% reduction)
- **Best for**: Routine commits, standard workflows
- **Use main model when**: Complex merge conflicts, major refactors requiring deep context

## Notes

- The haiku agent has full access to your git repository
- All documentation requirements are enforced
- The agent follows the same quality standards as the old skill
- Failed pre-commit hooks are reported for you to fix
- Agent ID is returned if you need to resume work
