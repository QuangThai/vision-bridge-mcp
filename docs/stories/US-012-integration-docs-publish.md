# US-012 Integration Examples and Package Documentation

## Status

implemented

## Lane

normal

## Product Contract

README and examples enable OpenCode, Droid, and Claude Code users to install and configure Atlas Vision MCP; package is ready for initial npm publish.

## Relevant Product Docs

- `docs/product/integration.md`
- `docs/product/overview.md`
- `docs/product/cli.md`

## Acceptance Criteria

- README: problem, quick start, env vars, tool list, security notes
- Copy-paste configs for OpenCode, Droid, Claude Code (from `integration.md`)
- Document `ENABLE_TOOL_SEARCH=false` for Claude Code custom providers
- Example prompts for agents ("use this tool when user references image path")
- `doctor` and CLI usage documented
- All four MCP tools registered and listed in README
- Version tagged; publish checklist noted (manual npm publish acceptable for v0)

## Design Notes

- Keep README concise; link to `docs/product/*` for depth
- Optional `examples/opencode.jsonc`, `examples/droid.sh`

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | no |
| Integration | yes — manual or scripted smoke: stdio server + doctor |
| E2E | yes — live agent hook routing and provider-backed tool workflows |
| Platform | yes — npx-style invocation documented |
| Release | yes — publish checklist completed |

## Harness Delta

Update README harness section if needed; trace recorded after MVP complete.

## Evidence

- `README.md` — quick start, env vars, tools, security, client configs
- `examples/` — OpenCode, Droid, Claude Code, agent prompts
- `docs/PUBLISH.md` — v0.1.0 publish checklist
- `tests/integration/publish-smoke.test.ts` — four-tool registration + default stdio + doctor smoke
- Version `1.0.2` in `package.json` and `src/constants.ts`
- Verified 2026-06-24: full suite pass (79 tests)
- Verified 2026-06-28: `pnpm typecheck`, `pnpm lint`, `pnpm test` (48 files, 434 tests), `pnpm build`, `pnpm test:e2e` (2 files, 32 tests), `pnpm smoke:agents`, `pnpm test:golden` (16/16 snapshots)
