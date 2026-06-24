# US-005 analyze_image Tool

## Status

implemented

## Lane

normal

## Product Contract

`analyze_image` MCP-ready handler validates input, reads image, calls provider, normalizes output to schema, returns markdown + JSON with observations/inferences/uncertainties separated.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/extraction-and-evidence.md`
- `docs/decisions/0004-text-json-evidence-output.md`
- `docs/decisions/0007-verified-inferred-discussed-separation.md`

## Acceptance Criteria

- `src/tools/analyze-image.ts` implements tool handler
- `src/extraction/schemas.ts` zod schemas for input/output
- `src/extraction/normalize.ts` clamps confidence, assigns IDs, separates observation vs inference
- Supports `mode` and `detail_level` parameters
- Output validates against zod before return
- Unit tests with mocked provider; fixture snapshot for normalized JSON shape

## Design Notes

- Modes: `general`, `diagram`, `chart`, `code_from_screenshot`, `document`, `error_screenshot`
- Optional graph nodes in output (minimal for first slice)

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — schema, normalization |
| Integration | yes — mocked provider end-to-end |
| E2E | no |
| Platform | no |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/tools/analyze-image.test.ts` — handler with mocked provider
- `tests/extraction/normalize.test.ts` — evidence normalization
- Verified 2026-06-24: full suite pass (79 tests)
