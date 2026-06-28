# US-004 Image Read, MIME Validation, and Preprocessing

## Status

implemented

## Lane

normal

## Product Contract

Local images are read safely: MIME detection, size limits, supported formats, optional resize, base64 encoding for provider.

## Relevant Product Docs

- `docs/product/provider.md`
- `docs/product/security.md`

## Acceptance Criteria

- `src/image/read-image.ts` reads file from path
- `src/image/mime.ts` detects png, jpg, jpeg, webp; rejects others clearly
- `src/image/limits.ts` enforces `VISION_MAX_IMAGE_MB`
- `src/image/preprocess.ts` optional resize when over limit
- Errors: file not found, unsupported format, too large, unreadable
- Unit tests with fixture images in `src/test-fixtures/screenshots/` or `tests/fixtures/`

## Design Notes

- Use `sharp` or `image-size` for metadata
- Path resolution happens before read; full path policy in US-011

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — MIME, limits, read errors |
| Integration | yes — end-to-end read + base64 |
| E2E | yes — live local path, URL image, and error-mode coverage |
| Platform | yes — exercised through built CLI and E2E test harness |
| Release | no |

## Harness Delta

None expected.

## Evidence

- `tests/image/read-image.test.ts` — MIME detection, limits, resize, unreadable/too-large errors
- Verified 2026-06-24: full suite pass (79 tests)
- Verified 2026-06-28: `pnpm test` (48 files, 434 tests), `pnpm test:e2e` (2 files, 32 tests)
