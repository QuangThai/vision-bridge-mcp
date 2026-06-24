# US-006 CLI analyze and doctor Commands

## Status

implemented

## Lane

normal

## Product Contract

Developers can run `atlas-vision analyze <path>` and `atlas-vision doctor` without an MCP client.

## Relevant Product Docs

- `docs/product/cli.md`
- `docs/product/provider.md`

## Acceptance Criteria

- `src/cli/main.ts` dispatches `analyze` and `doctor` subcommands
- `analyze` supports `--mode`, `--detail`, `--json`, `--save`
- `doctor` checks Node version, env vars, provider health, allowed dirs
- Human-readable output sections: Summary, Verified, Inferred, Uncertain
- `--json` emits same schema as tool output
- Exit codes: 0 success, non-zero on config/provider/read failures

## Design Notes

- Reuse `analyze_image` handler internally
- `doctor` may call `healthCheck()` from US-003

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — CLI arg parsing |
| Integration | yes — analyze with mocked provider |
| E2E | no |
| Platform | yes — CLI runs via package bin |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/cli/commands.test.ts` — analyze, doctor, ocr, compare, serve arg parsing and output
- Verified 2026-06-24: full suite pass (79 tests)
