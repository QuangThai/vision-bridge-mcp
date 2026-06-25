# Integration examples

Copy-paste configs for Atlas Vision MCP clients.

| File | Client |
| --- | --- |
| [`opencode.jsonc`](opencode.jsonc) | OpenCode |
| [`droid.sh`](droid.sh) | Factory Droid |
| [`claude-code.sh`](claude-code.sh) | Claude Code |
| [`agent-prompts.md`](agent-prompts.md) | Prompt snippets for agents |

## Quick start (any client)

```bash
# 1. Create a config file (avoids repeating --env flags everywhere)
npx atlas-vision-mcp config init
# Edit atlas-vision.toml: set api_key, base_url, model

# 2. Verify
npx atlas-vision-mcp doctor
```

Then configure your client below — most only need `npx -y atlas-vision-mcp`
as the command (config file is read automatically from the working directory).

## All examples

All examples below assume:

```text
npx -y atlas-vision-mcp
```

That command starts the MCP stdio server by default. See also
[`docs/product/integration.md`](../docs/product/integration.md).

## Config file vs env vars

| Approach | Pros | Cons |
|----------|------|------|
| `atlas-vision.toml` | Single file, no `--env` duplication, supports `config init` | Must be in project or `~/.config/atlas-vision/` |
| `--env` flags | Self-contained per-client config | Repeat same 4-5 vars in every MCP config |
| Shell `export` | Works everywhere | Fragile, easy to forget |

Create a template with: `atlas-vision config init`
