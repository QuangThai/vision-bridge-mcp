# Validation

## Proof Strategy

Prove that clipboard tools register over MCP, route to existing vision pipelines,
clean up temporary files, and return clear errors when no clipboard image exists.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Clipboard wrappers call analyze/OCR pipelines with clipboard path, add temp dir to allowlist, clean up temp path, and report no-image error. |
| Integration | MCP server lists clipboard tools and returns structured output/error responses. |
| E2E | Not required for this slice; live clipboard/provider tests remain environment-dependent. |
| Platform | Typecheck/build prove the stdio package shape compiles. |
| Performance | No new benchmark; wrappers reuse existing provider calls. |
| Logs/Audit | No image bytes or OCR text logged; temp files are deleted after analysis. |

## Fixtures

- Mock clipboard image path under OS temp directory.
- Mock vision provider JSON responses.

## Commands

```text
pnpm vitest run tests/tools/clipboard.test.ts tests/server/mcp-server.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Acceptance Evidence

2026-06-29:

- `pnpm vitest run tests/tools/clipboard.test.ts tests/server/mcp-server.test.ts` — 18 tests passed before adding the UI clipboard unit case; `tests/tools/clipboard.test.ts` now has 5 passing cases.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — 49 files, 442 tests passed.
- `pnpm build` — ESM and DTS bundles built successfully.
- OpenCode CLI E2E with `opencode/deepseek-v4-flash-free` called `atlas-vision_analyze_clipboard` and returned `ERR_CONNECTION_TIMED_OUT`.
- OpenCode CLI E2E with `opencode-go/glm-5.2` called `atlas-vision_analyze_clipboard` and returned the full connection error text.
- Droid CLI tool listing showed all 11 Atlas MCP tools including clipboard tools.
- Droid CLI E2E with `custom:Deepseek-V4-Flash-0` called `atlas-vision___analyze_clipboard` and returned `ERR_CONNECTION_TIMED_OUT`.
- Droid CLI E2E with `custom:glm-5.2-2` reported successful clipboard analysis and returned `ERR_CONNECTION_TIMED_OUT`.
