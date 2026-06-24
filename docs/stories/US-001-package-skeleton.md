# US-001 Package Skeleton

## Status

implemented

## Lane

normal

## Product Contract

A publishable TypeScript package skeleton exists with correct entrypoints, build tooling, and test runner wired but no business logic yet.

## Relevant Product Docs

- `docs/product/overview.md`
- `docs/decisions/0001-typescript-stack.md`

## Acceptance Criteria

- `package.json` with name, bin (`atlas-vision`), engines (Node ≥ 20)
- `tsconfig.json`, `tsup` build config, `vitest` config
- `src/index.ts` and placeholder module layout per planned structure
- `pnpm install` succeeds; `pnpm build` produces `dist/`
- `pnpm test` runs (even if zero tests initially)
- ESLint/prettier or biome configured

## Design Notes

- Commands: `pnpm install`, `pnpm build`, `pnpm test`, `pnpm lint`
- Planned layout: `src/{server,config,tools,providers,image,extraction,security,cli}/`
- No MCP or provider logic in this story

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | no |
| Integration | no |
| E2E | no |
| Platform | yes — build and test scripts execute |
| Release | no |

## Harness Delta

- Product docs and decisions created from SPEC decompose
- TEST_MATRIX rows added for MVP stories

## Evidence

- `tests/skeleton.test.ts` — bin help and package version
- Verified 2026-06-24: `pnpm build` (tsup ESM + DTS), `pnpm test` (16 files / 79 tests), `pnpm typecheck`
