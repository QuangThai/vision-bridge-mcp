# Test Matrix

This file maps product behavior to proof.

Mark a row `implemented` after tests or validation evidence exist locally.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-001 | TypeScript package skeleton builds and tests run | no | no | no | yes | implemented | `tests/skeleton.test.ts`; 2026-06-24 `pnpm build && pnpm test && pnpm typecheck` (16 files, 79 tests) |
| US-002 | Config/env loader with zod validation | yes | no | no | no | implemented | `tests/config.test.ts`; 2026-06-24 full suite pass |
| US-003 | OpenAI-compatible VisionProvider adapter | yes | yes | no | no | implemented | `tests/providers/openai-compatible.test.ts`; 2026-06-24 full suite pass |
| US-004 | Image read, MIME, size limits, preprocess | yes | yes | no | no | implemented | `tests/image/read-image.test.ts`; 2026-06-24 full suite pass |
| US-005 | analyze_image tool + normalization | yes | yes | no | no | implemented | `tests/tools/analyze-image.test.ts`, `tests/extraction/normalize.test.ts`; 2026-06-24 full suite pass |
| US-006 | CLI analyze and doctor | yes | yes | no | yes | implemented | `tests/cli/commands.test.ts`; 2026-06-24 full suite pass |
| US-007 | MCP stdio server + analyze_image | yes | yes | no | yes | implemented | `tests/server/mcp-server.test.ts`; 2026-06-24 full suite pass |
| US-008 | ocr_image tool + CLI ocr | yes | yes | no | no | implemented | `tests/tools/ocr-image.test.ts`, `tests/cli/commands.test.ts`, `tests/server/mcp-server.test.ts`; 2026-06-24 full suite pass |
| US-009 | analyze_ui_screenshot tool | yes | yes | no | no | implemented | `tests/tools/analyze-ui-screenshot.test.ts`, `tests/server/mcp-server.test.ts`; 2026-06-24 full suite pass |
| US-010 | compare_images tool + CLI compare | yes | yes | no | no | implemented | `tests/tools/compare-images.test.ts`, `tests/cli/commands.test.ts`; 2026-06-24 full suite pass |
| US-011 | Path policy, redaction, injection guards | yes | yes | no | no | implemented | `tests/path-policy.test.ts`, `tests/security/*`; 2026-06-24 full suite pass |
| US-012 | README, integration examples, publish readiness | no | yes | no | yes | implemented | `tests/integration/publish-smoke.test.ts`, `README.md`, `examples/`, `docs/PUBLISH.md`; 2026-06-24 full suite pass |

## Product Contract Index

| Doc | Covers |
| --- | --- |
| `docs/product/overview.md` | Vision bridge concept, design laws, MVP scope |
| `docs/product/mcp-tools.md` | Four MCP tools and schemas |
| `docs/product/provider.md` | VisionProvider, env, preprocessing |
| `docs/product/security.md` | Path policy, privacy, redaction |
| `docs/product/cli.md` | CLI commands |
| `docs/product/extraction-and-evidence.md` | Normalization, graph, claim status |
| `docs/product/integration.md` | OpenCode, Droid, Claude Code |
| `docs/product/roadmap.md` | Phases 0–6 |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers provider contracts, MCP round-trips, and service boundaries.
- E2E proof covers user-visible browser flows (Phase 5 web UI only).
- Platform proof covers CLI/bin, build scripts, and stdio server launch.
- A story can be implemented without every proof column if the story packet explains why.

## Source

Rows aligned with `docs/stories/US-001` through `US-012` and SPEC §17.8 build order.
