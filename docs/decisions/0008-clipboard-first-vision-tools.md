# 0008 Clipboard-First Vision Tools

Date: 2026-06-29

## Status

Accepted

## Context

OpenCode and Droid can paste images as native client attachments (`[Image 1]`).
For text-only models such as DeepSeek/GLM, those attachments are not visible to
the model and are not exposed to Atlas MCP tools as local file paths. Users need a
pathless workflow for copied screenshots without relying on client-specific native
vision support.

## Decision

Atlas will expose explicit clipboard-first MCP tools that read the OS clipboard
image directly, save a temporary PNG for the existing vision pipeline, temporarily
allow that generated file for the tool call, and delete it after analysis.

The supported first slice is:

- `analyze_clipboard`
- `ocr_clipboard`
- `diagnose_clipboard`
- `analyze_ui_clipboard`

Atlas will not claim to intercept Droid/OpenCode native `Alt+V` attachments unless
those clients expose attachment bytes or paths to MCP/hook APIs.

## Alternatives Considered

1. Require users to save screenshots and provide paths. Reliable, but poor UX.
2. Replace clipboard images with text paths via a background watcher. More Pi-like,
   but disrupts normal clipboard behavior in other apps and needs a toggle UX.
3. Hook native `Alt+V` attachments. Not available through current MCP surfaces.

## Consequences

Positive:

- Text-only agents can analyze copied screenshots without manual file saving.
- Security posture stays consistent with existing path/image validation.
- Clipboard temp files are short-lived and not durable history.

Tradeoffs:

- Users must ask for clipboard analysis instead of using native image attachment.
- Live behavior depends on OS clipboard APIs.
- Clipboard history/watch mode remains future work.

## Follow-Up

- Consider optional clipboard history/watch mode with dedupe and TTL after user validation.
- Document client-specific prompts/rules that encourage clipboard tools when no image path exists.
