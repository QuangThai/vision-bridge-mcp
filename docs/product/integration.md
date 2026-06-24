# Client Integration

Atlas Vision MCP integrates with MCP-compatible coding agents via **local stdio** and `npx`.

## OpenCode

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "atlas-vision": {
      "type": "local",
      "command": ["npx", "-y", "atlas-vision-mcp"],
      "enabled": true,
      "environment": {
        "VISION_PROVIDER": "openai-compatible",
        "VISION_BASE_URL": "https://api.openai.com/v1",
        "VISION_API_KEY": "YOUR_KEY",
        "VISION_MODEL": "gpt-4o-mini"
      }
    }
  }
}
```

## Factory Droid

```bash
droid mcp add atlas-vision "npx -y atlas-vision-mcp" \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini
```

Custom model with `noImageSupport: true` — main model stays text-only; Atlas handles vision.

## Claude Code

```bash
claude mcp add -s user atlas-vision \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini \
  -- npx -y atlas-vision-mcp
```

`npx -y atlas-vision-mcp` starts the MCP stdio server by default (no subcommand required).

With custom provider/proxy, document tool-search fallback:

```bash
ENABLE_TOOL_SEARCH=false claude
# or
ENABLE_TOOL_SEARCH=auto:5 claude
```

Keep tool set small (4 tools) so tools load upfront when tool search is disabled.

## Agent Prompt Guidance

README should include prompt snippets encouraging tool use when users reference image paths. Tool descriptions must state vision is required when main model lacks image support.

## Compatibility Targets (MVP)

- OpenCode Go
- Factory Droid (BYOK, `noImageSupport`)
- Claude Code (including custom `ANTHROPIC_BASE_URL`)
- Cline, Cursor, other stdio MCP clients

## Source

Derived from `SPEC.md` §5.7, §15.5–15.7.
