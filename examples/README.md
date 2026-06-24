# Integration examples

Copy-paste configs for Atlas Vision MCP clients.

| File | Client |
| --- | --- |
| [`opencode.jsonc`](opencode.jsonc) | OpenCode |
| [`droid.sh`](droid.sh) | Factory Droid |
| [`claude-code.sh`](claude-code.sh) | Claude Code |
| [`agent-prompts.md`](agent-prompts.md) | Prompt snippets for agents |

All examples assume:

```text
npx -y atlas-vision-mcp
```

That command starts the MCP stdio server by default. Set `VISION_API_KEY` and related env vars in each client's MCP environment block.

See also [`docs/product/integration.md`](../docs/product/integration.md).
