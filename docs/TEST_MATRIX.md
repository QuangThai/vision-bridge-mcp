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
| US-001 | TypeScript package skeleton builds and tests run | yes | yes | no | yes | implemented | `tests/skeleton.test.ts`; 2026-06-28 `pnpm typecheck`, `pnpm lint`, `pnpm test` (48 files, 434 tests), `pnpm build` |
| US-002 | Config/env loader with zod validation | yes | no | no | no | implemented | `tests/config.test.ts`, `tests/config-file.test.ts` |
| US-003 | OpenAI-compatible VisionProvider adapter | yes | yes | no | no | implemented | `tests/providers/openai-compatible.test.ts`, `tests/providers/openai-responses.test.ts`, `tests/providers/gemini.test.ts` |
| US-004 | Image read, MIME, size limits, preprocess | yes | yes | yes | yes | implemented | `tests/image/read-image.test.ts`, `tests/image/adaptive-detail.test.ts`; 2026-06-28 `pnpm test:e2e` path, URL, and error-mode coverage |
| US-005 | analyze_image tool + normalization | yes | yes | yes | yes | implemented | `tests/tools/analyze-image.test.ts`, `tests/extraction/normalize.test.ts`; 2026-06-28 `pnpm test:e2e`, `pnpm test:golden` |
| US-006 | CLI analyze and doctor | yes | yes | yes | yes | implemented | `tests/cli/commands.test.ts`; 2026-06-28 `pnpm test:e2e` hook CLI subprocess, `pnpm build` |
| US-007 | MCP stdio server + analyze_image | yes | yes | no | yes | implemented | `tests/server/mcp-server.test.ts` |
| US-008 | ocr_image tool + CLI ocr | yes | yes | yes | yes | implemented | `tests/tools/ocr-image.test.ts`, `tests/cli/commands.test.ts`; 2026-06-28 `pnpm test:e2e` live OCR coverage |
| US-009 | analyze_ui_screenshot tool | yes | yes | yes | yes | implemented | `tests/tools/analyze-ui-screenshot.test.ts`; 2026-06-28 `pnpm test:e2e` live UI screenshot coverage |
| US-010 | compare_images tool + CLI compare | yes | yes | yes | yes | implemented | `tests/tools/compare-images.test.ts`; 2026-06-28 `pnpm test:e2e` live before/after and diff-image coverage |
| US-011 | Path policy, redaction, injection guards | yes | yes | no | no | implemented | `tests/path-policy.test.ts`, `tests/security/*` |
| US-012 | README, integration examples, publish readiness | no | yes | yes | yes | implemented | `tests/integration/publish-smoke.test.ts`, `README.md`, `examples/`; 2026-06-28 `pnpm smoke:agents`, `pnpm test:e2e`, `pnpm test:golden` |

## Extended coverage (post-MVP)

| Area | Contract | Status | Evidence |
| --- | --- | --- | --- |
| Proxy routing / MAIN_MODEL_REF | composer* skips intercept; hook model wins over env | implemented | `tests/capabilities/proxy-resolver.test.ts`, `tests/integration/agent-routing.test.ts` |
| Multi-agent hooks | Cursor, Codex, Droid, Claude user-prompt routing | implemented | `tests/harness/user-prompt-hook.test.ts`, `tests/e2e/agent-hooks.e2e.test.ts` |
| Pi extension parity | `ctx.model.input` runtime signal | implemented | `tests/capabilities/pi-extension-smoke.test.ts` |
| Pi intercept session override | `/atlas on`, `off`, `auto`, and `status` control in-process image interception without changing env defaults | implemented | `tests/capabilities/pi-extension-command.test.ts` |
| Golden eval gate | Core fixtures @ 80% with snapshot verification | implemented | `tests/tools/eval.test.ts`, CI `pnpm test:golden`; 2026-06-28 `pnpm test:golden` passed with 16/16 snapshots |
| Batch / region tools | `analyze_image_batch`, `extract_region` | implemented | `tests/tools/analyze-image-batch.test.ts`, `tests/tools/extract-region.test.ts` |

## Product Contract Index

| Doc | Covers |
| --- | --- |
| `docs/product/overview.md` | Vision bridge concept, design laws, MVP scope |
| `docs/product/mcp-tools.md` | MCP tools and schemas |
| `docs/product/provider.md` | VisionProvider, env, preprocessing |
| `docs/product/security.md` | Path policy, privacy, redaction |
| `docs/product/cli.md` | CLI commands |
| `docs/product/extraction-and-evidence.md` | Normalization, graph, claim status |
| `docs/product/integration.md` | OpenCode, Droid, Claude Code, Pi |
| `docs/product/roadmap.md` | Phases 0–7 |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers provider contracts, MCP round-trips, and service boundaries.
- E2E proof covers live provider calls (`tests/e2e/`, requires `VISION_API_KEY`).
- Platform proof covers CLI/bin, build scripts, and stdio server launch.
- Live provider CI is opt-in because it spends provider credits. By default,
  maintainers run `pnpm test:e2e` and `pnpm test:golden` locally before release,
  then CI records an intentional skip when `VISION_API_KEY` is absent.
- Golden eval runs in CI only when a maintainer deliberately configures the
  `VISION_API_KEY` secret for provider-spend validation.

## Source

Rows aligned with `docs/stories/US-001` through `US-012` and extended post-MVP coverage.
