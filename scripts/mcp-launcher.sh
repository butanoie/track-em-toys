#!/bin/bash
# MCP Launcher - Loads environment variables from .env and starts MCP server

set -e

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env file if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Source the .env file properly
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
    echo "✓ Loaded environment variables from .env" >&2
else
    echo "⚠ Warning: .env file not found at $PROJECT_ROOT/.env" >&2
    echo "  Copy .env.example to .env and fill in your values" >&2
    exit 1
fi

# Verify required variables are set
if [ -z "$GITHUB_TOKEN" ] && [ "$1" = "github" ]; then
    echo "❌ Error: GITHUB_TOKEN not set in .env" >&2
    exit 1
fi

if [ -z "$DEEPL_API_KEY" ] && [ "$1" = "deepl" ]; then
    echo "❌ Error: DEEPL_API_KEY not set in .env" >&2
    exit 1
fi

# Start the requested MCP server
case "$1" in
    github)
        npx @modelcontextprotocol/server-github
        ;;
    deepl)
        npx deepl-mcp-server
        ;;
    *)
        echo "Usage: $0 {github|deepl}" >&2
        exit 1
        ;;
esac
