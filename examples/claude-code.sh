#!/usr/bin/env bash
set -euo pipefail

# Register Atlas Vision MCP with Claude Code (user scope).
# Replace YOUR_KEY before running.

claude mcp add -s user atlas-vision \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini \
  --env ATLAS_ALLOWED_DIRS=. \
  --env ATLAS_REDACT_SECRETS=true \
  -- npx -y atlas-vision-mcp

echo "Atlas Vision MCP registered."
echo "If tools do not appear with a custom provider, run: ENABLE_TOOL_SEARCH=false claude"
