#!/usr/bin/env bash

##
# Git Commit with Haiku Agent
#
# A script to perform git commits using Claude's haiku model for efficient token usage.
# This script can be used standalone or integrated into your git workflow.
#
# Usage:
#   ./scripts/git-commit-haiku.sh [commit message guidance]
#
# Examples:
#   ./scripts/git-commit-haiku.sh
#   ./scripts/git-commit-haiku.sh "Fix authentication bug"
#   ./scripts/git-commit-haiku.sh "Add user profile feature"
#
# Environment Variables:
#   CLAUDE_MODEL - Override model (default: haiku)
#   SKIP_VERIFICATION - Skip verification step (not recommended)
#

set -e

# Configuration
MODEL="${CLAUDE_MODEL:-haiku}"
COMMIT_MESSAGE_GUIDANCE="${*:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    error "Not a git repository"
    exit 1
fi

# Check for changes
if git diff --quiet && git diff --cached --quiet; then
    warn "No changes to commit"
    info "Working tree is clean"
    exit 0
fi

info "Starting git commit workflow with ${MODEL} model"
echo ""

# Step 1: Show current status
info "Checking repository status..."
git status --short

echo ""

# Step 2: Show what will be committed
info "Changes to be committed:"
if git diff --cached --quiet; then
    warn "No staged changes. Will analyze unstaged changes."
    git diff --stat
else
    git diff --cached --stat
fi

echo ""

# Step 3: Check recent commits for style reference
info "Recent commit messages (for style reference):"
git log --oneline -5
echo ""

# Step 4: Verify we should proceed
if [ -t 0 ]; then
    read -p "$(echo -e "${BLUE}?${NC} Proceed with commit? [Y/n] ")" -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        info "Commit cancelled"
        exit 0
    fi
fi

# Step 5: Instructions for Claude integration
cat << 'EOF'

To complete this commit with Claude Code, run the following in your Claude session:

```
Use the Task tool to create a git commit:
- subagent_type: "general-purpose"
- model: "haiku"
- description: "Create git commit"
- prompt: "Create a git commit following the standard workflow. Review changes,
verify documentation, stage files appropriately, create a descriptive commit
message following the repository's style, and commit with the Co-Authored-By
trailer. Verify success afterwards."
```

EOF

if [ -n "$COMMIT_MESSAGE_GUIDANCE" ]; then
    echo "Include this guidance in the commit message: $COMMIT_MESSAGE_GUIDANCE"
    echo ""
fi

success "Instructions generated"
info "Copy the above to Claude Code to complete the commit"

exit 0
