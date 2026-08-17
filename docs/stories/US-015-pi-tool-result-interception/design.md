# Design

## Domain Model

A tool-result interception has three relevant inputs:

- Model capability: native vision, text-only, or unknown.
- Explicit result content: text blocks and image blocks emitted by the tool.
- Tool provenance: tool name, tool call id, success/error state, and original input.

Image blocks are the canonical source because they are explicit tool output.
Identical image blocks are deduplicated by content digest. A path is only a
fallback for a successful `read` result with no image block.

## Application Flow

1. The Pi `tool_result` event short-circuits for `/atlas off` and native-vision
   models unless interception is forced.
2. The extension passes `toolName`, `toolCallId`, `isError`, content, active
   model context, cwd, and Pi's abort signal to the harness API.
3. The harness selects sources:
   - explicit valid image blocks, or
   - one successful `read` image path when no image block exists.
4. Image blocks are written to a unique directory under Atlas's internal temp
   root. Path fallback remains the original path.
5. Existing capability planning and vision execution produce evidence.
6. Evidence is appended as a text block while original content is preserved.
7. Temporary files are removed in `finally`, including planner refusal,
   cancellation, and provider failure paths.

## Interface Contract

`interceptToolResultImage()` accepts an agent-neutral structural equivalent of
Pi's tool-result event:

- `toolName: string`
- `toolCallId: string`
- `toolInput: Record<string, unknown>`
- `content: Array<TextPart | ImagePart>`
- `isError: boolean`
- model capability and environment fields

It returns unchanged/undefined content when no safe source should be analyzed,
or patched content plus the number of evidence blocks when interception occurs.

Malformed image blocks are ignored. `mimeType` is required for a valid image
block, matching Pi's `ImageContent` contract; Atlas does not guess a MIME type.

## Data Model

No durable schema or history is added. Temporary files are process-local,
unique, and deleted before the interception promise settles.

## UI / Platform Impact

Pi's status line shows a shared analyzing state while one or more interceptions
are active. Concurrent tool results cannot prematurely restore the idle status.
Cancellation returns the original tool result without a warning notification.

## Observability

- Existing provider/cache/cost tracking remains authoritative.
- User-visible warnings are emitted for non-cancellation failures.
- Tests prove source selection, policy preservation, cleanup, and concurrency.

## Alternatives Considered

1. Analyze image blocks and all discovered paths. Rejected: duplicates provider
   calls and treats unrelated text output as upload authorization.
2. Automatically allowlist every tool-input parent directory. Rejected: local
   readability is not equivalent to permission to disclose content remotely.
3. Analyze image blocks only, with no path fallback. Safest, but loses Pi's
   useful recovery path when its own image processing cannot emit an image
   block. The accepted fallback is therefore limited to successful `read` calls
   and the existing path policy.
