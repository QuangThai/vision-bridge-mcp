# US-011 Safety — Path Policy, Redaction, Prompt-Injection Guards

## Status

implemented

## Lane

high-risk

## Product Contract

File access is constrained to allowed directories; OCR secrets can be redacted; image text is never treated as instructions; privacy defaults enforced.

## Relevant Product Docs

- `docs/product/security.md`
- `docs/decisions/0006-no-persistence-by-default.md`
- `docs/decisions/0007-verified-inferred-discussed-separation.md`

## Acceptance Criteria

- `src/security/path-policy.ts` enforces `ATLAS_ALLOWED_DIRS`; rejects traversal
- `src/security/redact.ts` redacts common secret patterns when enabled
- `src/security/prompt-injection.ts` adds warnings/tags for untrusted OCR text
- Errors include cwd and allowed dirs for path failures
- Defaults: no history, no image content logging
- Dedicated `tests/path-policy.test.ts` and redaction unit tests
- Human confirmation obtained before implementation if policy scope ambiguous

## Design Notes

- Integrate path policy into all image read paths (US-004+)
- Redaction runs in normalization pipeline after OCR

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | yes — path policy, redaction patterns |
| Integration | yes — blocked path, redacted output |
| E2E | no |
| Platform | no |
| Release | no |

## Harness Delta

Consider `docs/templates/high-risk-story/` artifacts if lane escalates during implementation.

## Evidence

- `tests/path-policy.test.ts` — allowed root and traversal rejection
- `tests/security/redact.test.ts` — secret pattern redaction
- `tests/security/prompt-injection.test.ts` — injection warnings and untrusted tags
- `tests/security/integration.test.ts` — blocked path + redacted OCR output
- Verified 2026-06-24: full suite pass (79 tests)
