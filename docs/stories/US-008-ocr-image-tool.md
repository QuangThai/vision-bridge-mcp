# US-008 ocr_image Tool

## Status

implemented

## Lane

normal

## Product Contract

`ocr_image` extracts visible text with layout options, marks output as untrusted evidence, includes warnings for security.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/security.md`
- `docs/decisions/0007-verified-inferred-discussed-separation.md`

## Acceptance Criteria

- `src/tools/ocr-image.ts` implements handler
- Input: `preserve_layout`, `extract_tables`, `extract_code`
- Output: `visible_text[]`, `layout_text`, `warnings[]`
- Security note in output when text extracted
- Registered on MCP server; CLI `atlas-vision ocr` command
- Unit + integration tests with mocked provider

## Design Notes

- May share provider call with analyze mode tuned for OCR
- Redaction hooks stubbed until US-011

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes |
| Integration | yes |
| E2E | no |
| Platform | no |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/tools/ocr-image.test.ts` — handler + normalization with mocked provider
- `tests/server/mcp-server.test.ts` — MCP `ocr_image` round-trip
- `tests/cli/commands.test.ts` — CLI `ocr` json output
- Verified 2026-06-24: full suite pass (79 tests)
