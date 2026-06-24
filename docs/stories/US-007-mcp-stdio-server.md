# US-007 MCP Stdio Server

## Status

implemented

## Lane

normal

## Product Contract

MCP server runs over stdio, registers `analyze_image` (minimum), returns MCP tool results with text + structured content.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/integration.md`
- `docs/decisions/0002-mcp-stdio-local-first.md`
- `docs/decisions/0005-four-tool-surface.md`

## Acceptance Criteria

- `src/server.ts` uses official TypeScript MCP SDK
- `atlas-vision serve --transport stdio` starts server
- `analyze_image` registered with schema from zod
- Tool description matches Appendix A wording
- Returns `content` (markdown) and `structuredContent` (JSON)
- Integration test: spawn server, send tool call (mocked provider)

## Design Notes

- Additional tools wired in US-008–US-010; server architecture must accept registration pattern
- `src/index.ts` exports bin entry

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — tool registration |
| Integration | yes — stdio MCP round-trip with mock |
| E2E | no |
| Platform | yes — npx/bin stdio launch |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/server/mcp-server.test.ts` — InMemoryTransport round-trip with mocked tools
- Verified 2026-06-24: full suite pass (79 tests)
