# Validation

## Proof Strategy

Verification must demonstrate both the intended mid-turn capability and deletion
sensitivity for the previously identified failures. Passing happy-path tests is
insufficient if duplicate provider calls, unrelated path scans, policy widening,
or temporary-file retention remain possible.

## Test Plan

| Layer | Cases |
| --- | --- |
| Unit | Native-vision skip; forced intercept; image-block analysis; identical block dedupe; image block + read path produces one call; malformed block skip; no-image pass-through. |
| Integration | Successful `read` path fallback; failed `read` skip; `ls`/`find`/text paths ignored; configured allowed dirs unchanged; evidence appended while original content is preserved. |
| E2E | Pi extension registers `tool_result`, forwards provenance and abort signal, and respects `/atlas off`. |
| Platform | Typecheck, Biome, Vitest, and tsup build on the supported Node baseline. |
| Performance | One normal Pi image read produces exactly one planned/provider call. |
| Logs/Audit | Non-cancellation failures warn; cancellation is quiet; no image bytes are logged. |

## Fixtures

- Deterministic 1x1 PNG image block.
- Stub capability planner and vision executor.
- Temporary project and external image paths.
- Two concurrent tool-result interceptions with separate image bytes.

## Commands

```text
pnpm vitest run tests/harness/tool-result-intercept.test.ts tests/harness/intercept-images.test.ts tests/capabilities/pi-extension-command.test.ts tests/integration/pi-tool-result-intercept.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

## Acceptance Evidence

- Targeted story proof: 4 files, 22 tests passed.
- Official Pi integration proof: `createReadTool()` emitted a real image result
  and Atlas produced exactly one planned/provider call.
- Unit/integration suite excluding the Windows symlink-only file: 52 files,
  478 tests passed.
- Full unit run: 483 passed; 2 pre-existing path-policy tests could not create
  Windows directory symlinks (`EPERM`) on this non-elevated host.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed.
- Local live E2E run: agent-hook and primary vision suites passed; Gemini suites
  were partially blocked by external free-tier quota/high-demand responses. No
  failure involved the Pi tool-result path.
- GitHub Actions run `32011322602`: `check`, `e2e-tests`, and `golden-eval` all
  passed on the pushed PR head.
