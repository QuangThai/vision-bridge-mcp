# US-009 analyze_ui_screenshot Tool

## Status

implemented

## Lane

normal

## Product Contract

`analyze_ui_screenshot` returns UI elements, layout, accessibility issues, and implementation hints for frontend work.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/extraction-and-evidence.md`

## Acceptance Criteria

- `src/tools/analyze-ui-screenshot.ts` implements handler
- Supports `target_framework`, `style_system`, `goal` parameters
- Output: `ui_elements[]`, `layout`, `accessibility_issues[]`, `implementation_plan[]`
- Does not invent hidden state or behavior; uncertainties required
- MCP registration + optional CLI `--mode ui` alias
- Tests with fixture UI screenshot (mocked provider)

## Design Notes

- `screen_type` enum: login, dashboard, form, landing, settings, modal, unknown
- Confidence on each UI element

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes |
| Integration | yes |
| E2E | yes — live UI screenshot and URL-image analysis coverage |
| Platform | yes — built package and CLI validation pass |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/tools/analyze-ui-screenshot.test.ts` — handler + normalization with mocked provider
- `tests/server/mcp-server.test.ts` — MCP `analyze_ui_screenshot` round-trip
- `tests/cli/commands.test.ts` — `analyze --mode ui` delegates to UI tool
- Verified 2026-06-24: full suite pass (79 tests)
- Verified 2026-06-28: `pnpm test` (48 files, 434 tests), `pnpm test:e2e` (2 files, 32 tests)
