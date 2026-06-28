# US-010 compare_images Tool

## Status

implemented

## Lane

normal

## Product Contract

`compare_images` compares before/after local images and returns differences with severity and regression likelihood.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/extraction-and-evidence.md`

## Acceptance Criteria

- `src/tools/compare-images.ts` implements handler
- Input: `before_path`, `after_path`, `focus`, `severity_threshold`
- Output: `differences[]`, `regression_likelihood`, `recommended_next_steps[]`
- Provider `compareImages` or dual-analyze strategy documented in code
- MCP registration + CLI `atlas-vision compare`
- Tests with paired fixture images (mocked provider)

## Design Notes

- Difference types: layout, text, color, missing_element, new_element, alignment, unknown
- Both images subject to same read/MIME pipeline as US-004

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes |
| Integration | yes |
| E2E | yes — live before/after comparison, URL comparison, and diff-image generation |
| Platform | yes — CLI command and built package exercised in release checks |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/tools/compare-images.test.ts` — handler + severity filtering with mocked provider
- `tests/server/mcp-server.test.ts` — MCP `compare_images` round-trip
- `tests/cli/commands.test.ts` — CLI `compare` json output
- Verified 2026-06-24: full suite pass (79 tests)
- Verified 2026-06-28: `pnpm test` (48 files, 434 tests), `pnpm test:e2e` (2 files, 32 tests)
