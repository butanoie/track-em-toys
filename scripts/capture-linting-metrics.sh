#!/bin/bash

##############################################################################
# Linting Metrics Capture Script
#
# Captures code quality metrics (linting, type-checking, tests, coverage)
# and appends them to a metrics log file for dashboard tracking.
#
# Usage: ./scripts/capture-linting-metrics.sh
#
# Creates/updates: metrics-log.json in project root
##############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
METRICS_FILE="$PROJECT_ROOT/metrics-log.json"
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📊 Capturing Code Quality Metrics...${NC}"
echo "Timestamp: $TIMESTAMP"
echo ""

# Change to v2 directory where package.json scripts are
cd "$PROJECT_ROOT/v2"

# Initialize metrics object
METRICS="{\"timestamp\":\"$TIMESTAMP\","

# 1. Capture ESLint Results
echo -e "${YELLOW}Running ESLint...${NC}"
ESLINT_OUTPUT=$(npm run lint 2>&1 || true)
ESLINT_ERRORS=$(echo "$ESLINT_OUTPUT" | grep -oE "[0-9]+ error" | grep -oE "[0-9]+" | head -1 || echo "0")
ESLINT_WARNINGS=$(echo "$ESLINT_OUTPUT" | grep -oE "[0-9]+ warning" | grep -oE "[0-9]+" | head -1 || echo "0")

if [ -z "$ESLINT_ERRORS" ]; then
  ESLINT_ERRORS=0
fi
if [ -z "$ESLINT_WARNINGS" ]; then
  ESLINT_WARNINGS=0
fi

echo "  Errors: $ESLINT_ERRORS"
echo "  Warnings: $ESLINT_WARNINGS"

METRICS="$METRICS\"eslint\":{\"errors\":$ESLINT_ERRORS,\"warnings\":$ESLINT_WARNINGS},"

# 2. Capture TypeScript Type Check Results
echo -e "${YELLOW}Running TypeScript Type Check...${NC}"
TYPECHECK_OUTPUT=$(npm run type-check 2>&1 || true)
TYPECHECK_ERRORS=$(echo "$TYPECHECK_OUTPUT" | grep -oE "error TS[0-9]+" | wc -l || echo "0")

echo "  Type Errors: $TYPECHECK_ERRORS"

METRICS="$METRICS\"typecheck\":{\"errors\":$TYPECHECK_ERRORS},"

# 3. Capture Test Results
echo -e "${YELLOW}Running Tests...${NC}"
TEST_OUTPUT=$(npm test 2>&1 || true)
TEST_PASSED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" | head -1 || echo "0")
TEST_FAILED=$(echo "$TEST_OUTPUT" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo "0")

if [ -z "$TEST_PASSED" ]; then
  TEST_PASSED=0
fi
if [ -z "$TEST_FAILED" ]; then
  TEST_FAILED=0
fi

echo "  Passed: $TEST_PASSED"
echo "  Failed: $TEST_FAILED"

METRICS="$METRICS\"tests\":{\"passed\":$TEST_PASSED,\"failed\":$TEST_FAILED},"

# 4. Count files and lines
echo -e "${YELLOW}Analyzing Codebase...${NC}"
TS_FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "./node_modules/*" ! -path "./.next/*" | wc -l)
TOTAL_LINES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "./node_modules/*" ! -path "./.next/*" -exec wc -l {} + | tail -1 | awk '{print $1}')

echo "  TypeScript Files: $TS_FILES"
echo "  Total Lines: $TOTAL_LINES"

METRICS="$METRICS\"codebase\":{\"tsFiles\":$TS_FILES,\"totalLines\":$TOTAL_LINES}"

# Close JSON object
METRICS="$METRICS}"

# Initialize metrics log if it doesn't exist
if [ ! -f "$METRICS_FILE" ]; then
  echo "[$METRICS]" > "$METRICS_FILE"
else
  # Append to existing metrics log
  # Remove closing bracket from existing log
  TEMP_FILE=$(mktemp)
  head -c -2 "$METRICS_FILE" > "$TEMP_FILE"
  echo ",$METRICS]" >> "$TEMP_FILE"
  mv "$TEMP_FILE" "$METRICS_FILE"
fi

echo ""
echo -e "${GREEN}✅ Metrics captured successfully!${NC}"
echo "Metrics file: $METRICS_FILE"
echo ""
echo "View the CODE_QUALITY_DASHBOARD at: docs/CODE_QUALITY_DASHBOARD.md"
