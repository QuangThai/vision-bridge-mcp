# US-013 Clipboard-First Vision Tools

## Current Behavior

Atlas can analyze explicit image paths/URLs and hooks can optionally inspect the
clipboard. In OpenCode/Droid, native image paste with text-only models can become
an internal `[Image 1]` attachment that MCP tools cannot access, causing models to
ask for a path or claim image support is unavailable.

## Target Behavior

Atlas exposes clipboard-first MCP tools so a coding agent can read the current OS
clipboard image directly and receive normal Atlas vision evidence without asking
the user to save a file.

## Affected Users

- Developers using OpenCode/Droid/Codex-like agents with text-only models.
- Developers copying screenshots from Lightshot, Snipping Tool, browser image copy,
  or similar OS clipboard sources.

## Affected Product Docs

- `README.md`
- `docs/product/mcp-tools.md`
- `docs/product/integration.md`
- `docs/product/security.md`

## Non-Goals

- Do not make Droid/OpenCode native `Alt+V` attachments visible to MCP.
- Do not add a persistent clipboard watcher/history in this slice.
- Do not bypass provider upload: clipboard images still go to the configured vision provider.
