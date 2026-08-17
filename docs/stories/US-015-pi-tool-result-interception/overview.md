# US-015 Pi Tool-Result Image Interception

## Current Behavior

The Pi extension intercepts images attached to a user prompt in
`before_agent_start`. Images emitted later by tools remain in the tool result,
but Pi omits those image blocks from requests to a text-only model. The model
therefore receives only Pi's omission note and cannot inspect screenshots read
mid-turn.

## Target Behavior

When an enabled Pi session uses a text-only model, Atlas analyzes explicit image
content blocks from a completed tool result and appends text evidence to that
same result. A successful Pi `read` result may fall back to its image path only
when no image block was emitted. Path fallback obeys `ATLAS_ALLOWED_DIRS`; Atlas
never scans arbitrary tool-result text for image paths and never widens the
configured path policy for an arbitrary source file.

Temporary copies of image blocks are isolated per interception, removed after
the provider call, and safe under parallel tool execution. Native-vision models
and `/atlas off` remain zero-cost bypasses.

## Affected Users

- Pi users running text-only main models such as DeepSeek or GLM.
- Maintainers responsible for local-file privacy and provider-upload boundaries.

## Affected Product Docs

- `docs/product/pi-integration.md`
- `docs/product/security.md`
- `README.md`

## Non-Goals

- Inferring image paths from `ls`, `find`, shell output, or arbitrary text.
- Uploading failed `read` targets or bypassing `ATLAS_ALLOWED_DIRS`.
- Changing MCP tool behavior or native-vision model routing.
- Persisting tool-result images as history.
