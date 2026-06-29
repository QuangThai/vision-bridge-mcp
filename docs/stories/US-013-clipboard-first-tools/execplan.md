# Exec Plan

## Goal

Add clipboard-first MCP tools so text-only coding agents can analyze copied screenshots without native image attachment support or manual file saving.

## Scope

In scope:

- Add clipboard MCP tool wrappers around existing analyze/OCR/UI pipelines.
- Delete clipboard temp files after analysis.
- Surface a clear no-image clipboard error.
- Update docs and tests.

Out of scope:

- Persistent clipboard history/watch mode.
- Client-specific Droid/OpenCode keybinding changes.
- Upstream changes to expose native image attachments to MCP.

## Risk Classification

Risk flags:

- Public contracts: new MCP tools.
- Cross-platform: clipboard behavior differs by OS/client.
- Existing behavior: MCP tool surface changes.
- Weak proof: live clipboard E2E depends on host OS/provider.

Hard gates:

- Audit/security: clipboard screenshots can contain secrets.

## Work Phases

1. Discovery of existing tool registration and clipboard hook code.
2. Design clipboard-first wrappers with no persistence by default.
3. Add unit/server tests.
4. Implement MCP registrations and exports.
5. Update product docs/story/decision records.
6. Run targeted tests plus project validation.

## Stop Conditions

Pause for human confirmation if:

- Clipboard watcher/path replacement becomes required in this slice.
- Native Droid/OpenCode attachment interception is requested as guaranteed behavior.
- Validation requirements need to be weakened.
