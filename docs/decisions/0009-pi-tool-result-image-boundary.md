# 0009 Pi Tool-Result Image Boundary

Date: 2026-08-17

## Status

Accepted

## Context

Pi's `read` tool emits explicit image content blocks, but omits them from the
provider request when the active model is text-only. Atlas needs to translate
those mid-turn images into text evidence. The initial implementation also
collected paths from tool inputs and arbitrary result text, then automatically
added their parent directories to the path allowlist. That caused duplicate
provider calls and confused local readability with authorization to disclose a
file to the configured remote vision provider.

## Decision

Atlas treats explicit tool-result image blocks as the canonical authorization
surface when Pi interception is enabled. It may persist those already-emitted
bytes only in a unique Atlas internal temp directory and must delete them after
the interception settles.

When no image block exists, Atlas may use a path only for a successful Pi
`read` result whose input is an image path. That fallback remains subject to the
existing `ATLAS_ALLOWED_DIRS` policy. Atlas will not automatically widen that
policy for source files and will not infer image paths from arbitrary tool-result
text, directory listings, search output, or unrelated tool inputs.

Native-vision models and disabled interception remain no-op paths. Concurrent
tool results must use isolated temp storage, and Pi cancellation must abort the
nested provider request when supported by the fetch boundary.

## Alternatives Considered

1. Automatically allowlist source directories because Pi already read the file.
   Rejected: local process access and remote provider disclosure are distinct
   security decisions.
2. Scan all tool-result text for image-looking paths. Rejected: output is not an
   explicit request to upload each referenced file.
3. Require `ATLAS_ALLOWED_DIRS` even for already-emitted in-memory image blocks.
   Rejected: those bytes are explicit tool output, equivalent to an attachment;
   the policy continues to govern new local path reads.
4. Remove path fallback entirely. Rejected because Pi can emit only an omission
   note when its own image processing fails, while Atlas may still process an
   explicitly requested and policy-allowed source image.

## Consequences

Positive:

- One normal Pi image read results in one vision analysis.
- Arbitrary text cannot trigger provider uploads.
- User-configured path roots remain authoritative for source-file reads.
- Temporary image bytes do not become durable history.
- Parallel tool execution cannot overwrite another interception's temp image.

Tradeoffs:

- Custom tools that return only a path are not auto-intercepted; they should emit
  a proper image content block.
- Reading an out-of-policy image path without an image block requires the user to
  extend `ATLAS_ALLOWED_DIRS` explicitly.

## Follow-Up

- Keep compatibility tests aligned with Pi's official `tool_result` and
  `ImageContent` contracts.
- Revisit path-only support only if Pi adds an explicit trusted-output metadata
  contract.
