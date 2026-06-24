#!/usr/bin/env bash
set -euo pipefail

# Register Atlas Vision MCP with Factory Droid.
# Replace YOUR_KEY before running.

droid mcp add atlas-vision "npx -y atlas-vision-mcp" \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini \
  --env ATLAS_ALLOWED_DIRS=. \
  --env ATLAS_REDACT_SECRETS=true

echo "Atlas Vision MCP registered. Use a text-only main model with noImageSupport when needed."
