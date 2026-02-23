#!/usr/bin/env bash

##
# Changelog Creation with Haiku Agent
#
# A script to prepare and create comprehensive changelog entries using Claude's
# haiku model for efficient token usage.
#
# Usage:
#   ./scripts/changelog-create-haiku.sh [brief description]
#
# Examples:
#   ./scripts/changelog-create-haiku.sh
#   ./scripts/changelog-create-haiku.sh "Testing infrastructure setup"
#   ./scripts/changelog-create-haiku.sh "Haiku agent implementation"
#
# Environment Variables:
#   CLAUDE_MODEL - Override model (default: haiku)
#   CHANGELOG_DIR - Override changelog directory (default: changelog/)
#

set -e

# Configuration
MODEL="${CLAUDE_MODEL:-haiku}"
CHANGELOG_DIR="${CHANGELOG_DIR:-changelog}"
DESCRIPTION="${*:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
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

header() {
    echo -e "${CYAN}${BOLD}$1${NC}"
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    warn "Not a git repository (changelog will still be created)"
fi

# Create changelog directory if it doesn't exist
if [ ! -d "$CHANGELOG_DIR" ]; then
    info "Creating changelog directory: $CHANGELOG_DIR"
    mkdir -p "$CHANGELOG_DIR"
fi

header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
header "  Changelog Creation Preparation"
header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Generate timestamp
TIMESTAMP=$(date '+%Y-%m-%dT%H%M%S')
DATE=$(date '+%Y-%m-%d')
TIME=$(date '+%H:%M:%S %Z')

success "Generated timestamp: $TIMESTAMP"
echo ""

# Show recent activity
info "Recent git activity (for context):"
echo ""

if git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${CYAN}Recent commits:${NC}"
    git log --oneline -5 --color=always || true
    echo ""

    echo -e "${CYAN}Recent changes:${NC}"
    git diff --stat HEAD~5..HEAD 2>/dev/null | head -20 || echo "  (No recent changes)"
    echo ""
fi

# Show current directory structure highlights
info "Recent files in project:"
echo ""
echo -e "${CYAN}Recently modified files (last 7 days):${NC}"
find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" -o -name "*.md" 2>/dev/null | \
    grep -v node_modules | \
    grep -v ".next" | \
    grep -v "dist" | \
    head -15 || echo "  (No recent files found)"
echo ""

# Show project statistics
info "Project statistics:"
echo ""

if [ -f "package.json" ]; then
    DEP_COUNT=$(grep -c "\"" package.json 2>/dev/null | head -1 || echo "?")
    echo "  📦 package.json exists (dependencies: ~$((DEP_COUNT/2)))"
fi

TS_FILES=$(find . -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v node_modules | wc -l | xargs)
echo "  📄 TypeScript files: $TS_FILES"

TEST_FILES=$(find . -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" 2>/dev/null | grep -v node_modules | wc -l | xargs)
echo "  🧪 Test files: $TEST_FILES"

CHANGELOG_COUNT=$(find "$CHANGELOG_DIR" -name "*.md" 2>/dev/null | wc -l | xargs)
echo "  📝 Existing changelogs: $CHANGELOG_COUNT"

echo ""

# Suggest filename
if [ -n "$DESCRIPTION" ]; then
    # Convert description to filename format
    SUGGESTED_NAME=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | sed 's/[^a-z0-9-]//g')
    SUGGESTED_FILENAME="${TIMESTAMP}_${SUGGESTED_NAME}.md"
else
    SUGGESTED_FILENAME="${TIMESTAMP}_change-description.md"
fi

info "Suggested filename: ${BOLD}$SUGGESTED_FILENAME${NC}"
echo ""

# Provide instructions for Claude
header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
header "  Instructions for Claude Code"
header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat << EOF
To create a comprehensive changelog entry with Claude Code, use:

${CYAN}/changelog-create${NC}

Or use the Task tool directly:

${YELLOW}Use the Task tool to create a changelog:
- subagent_type: "general-purpose"
- model: "haiku"
- description: "Create changelog entry"
- prompt: "Create a comprehensive changelog entry for recent changes.

  Use these details:
  - Timestamp: $TIMESTAMP
  - Date: $DATE
  - Time: $TIME
  - Suggested filename: changelog/$SUGGESTED_FILENAME
  $([ -n "$DESCRIPTION" ] && echo "  - Description guidance: $DESCRIPTION")

  Follow the complete changelog creation workflow:
  1. Gather information about changes (git diff, git log, file counts)
  2. Create comprehensive changelog with all required sections
  3. Include actual validation output (npm run type-check, lint, test)
  4. List all created/modified files with line counts
  5. Provide impact assessment and summary statistics
  6. Mark status as ✅ COMPLETE

  Ensure the changelog is thorough, well-structured, and includes
  code examples, actual command output, and comprehensive details."${NC}

EOF

echo ""

# Provide quick reference
header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
header "  Quick Reference"
header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cat << EOF
${BOLD}Required Sections:${NC}
  1. Header Metadata (Date, Time, Type, Version)
  2. Summary (2-3 sentences)
  3. Changes Implemented (categorized with files)
  4. Technical Details (code examples)
  5. Validation & Testing (actual output)
  6. Impact Assessment (immediate + long-term)
  7. Related Files (all created/modified)
  8. Status (✅ COMPLETE)

${BOLD}Optional Sections:${NC}
  - Summary Statistics
  - Next Steps
  - Future Enhancements
  - References
  - Documentation Benefits

${BOLD}Types to Use:${NC}
  - Phase Completion
  - Infrastructure Enhancement
  - Feature Addition
  - Configuration Update
  - Breaking Change
  - Documentation Standards

${BOLD}Quality Standards:${NC}
  ✓ Comprehensive (include ALL details)
  ✓ Evidence-based (show actual output)
  ✓ Well-structured (headings, bullets, code blocks)
  ✓ Explanatory (explain WHY, not just WHAT)
  ✓ Accurate (verify all information)

${BOLD}Reference Examples:${NC}
  - changelog/2026-01-27T082828_testing-infrastructure-setup.md
  - changelog/2026-01-25T233843_static-analysis-documentation-enforcement.md
  - changelog/2026-01-25T231357_phase1-completion.md

EOF

echo ""
success "Preparation complete"
info "Ready to create changelog with Claude Code"
echo ""

exit 0
