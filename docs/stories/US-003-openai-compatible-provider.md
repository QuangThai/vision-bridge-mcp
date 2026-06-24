# US-003 OpenAI-Compatible Provider Adapter

## Status

implemented

## Lane

normal

## Product Contract

`VisionProvider` interface is implemented for `openai-compatible` backends: analyze image via chat completions, health check, timeout handling.

## Relevant Product Docs

- `docs/product/provider.md`
- `docs/decisions/0003-openai-compatible-provider-first.md`
- `docs/decisions/0004-text-json-evidence-output.md`

## Acceptance Criteria

- `src/providers/types.ts` defines `VisionProvider`, input/output types
- `src/providers/openai-compatible.ts` sends base64 image + system prompt
- `src/providers/router.ts` selects provider from config
- `healthCheck()` validates connectivity (mockable in tests)
- Provider errors surface as typed failures (timeout, auth, HTTP)
- Unit tests with mocked HTTP; no live API required in CI

## Design Notes

- HTTP client: `fetch` or `undici`
- Temperature 0.1, `max_tokens` from config
- Raw response typed as `RawVisionResult` for normalization layer

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — request shaping, error mapping |
| Integration | yes — mocked provider contract |
| E2E | no |
| Platform | no |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/providers/openai-compatible.test.ts` — provider factory, health check, analyze/compare with mocked fetch
- Verified 2026-06-24: full suite pass (79 tests)
