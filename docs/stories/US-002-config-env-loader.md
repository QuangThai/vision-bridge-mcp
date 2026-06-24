# US-002 Config and Environment Loader

## Status

implemented

## Lane

normal

## Product Contract

All runtime configuration loads from environment variables with zod validation, sensible defaults, and clear errors for missing required values.

## Relevant Product Docs

- `docs/product/provider.md`
- `docs/product/security.md`
- `docs/decisions/0003-openai-compatible-provider-first.md`

## Acceptance Criteria

- `src/config.ts` parses `VISION_*` and `ATLAS_*` env vars
- Invalid config throws actionable error messages
- Defaults match product docs (`ATLAS_LOG_IMAGE_CONTENT=false`, etc.)
- Unit tests cover valid config, missing API key, invalid numeric limits

## Design Notes

- Env vars: `VISION_PROVIDER`, `VISION_BASE_URL`, `VISION_API_KEY`, `VISION_MODEL`, `VISION_TIMEOUT_MS`, `VISION_MAX_IMAGE_MB`, `VISION_MAX_OUTPUT_TOKENS`, `ATLAS_ALLOWED_DIRS`, `ATLAS_STORE_HISTORY`, `ATLAS_LOG_LEVEL`, `ATLAS_LOG_IMAGE_CONTENT`, `ATLAS_REDACT_SECRETS`, `ATLAS_DEFAULT_DETAIL_LEVEL`
- Parse at boundary; inner code receives typed config object

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — config parsing and defaults |
| Integration | no |
| E2E | no |
| Platform | no |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/config.test.ts` — env parsing, validation, provider config
- Verified 2026-06-24: full suite pass (79 tests)
