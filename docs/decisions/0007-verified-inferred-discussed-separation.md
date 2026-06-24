# 0007 Verified, Inferred, Discussed Separation

Date: 2026-06-24

## Status

Accepted

## Context

Vision models and agents hallucinate. Mixing image-grounded facts with conversation or guesses degrades trust and security.

## Decision

All outputs separate **verified** (image-grounded), **inferred**, **discussed**, and **uncertain** claims with confidence scores and evidence IDs.

## Alternatives Considered

1. **Single prose blob** — easier to generate but not auditable or testable

## Consequences

Positive:

- Reduces hallucination risk; supports testing and future Ask Atlas
- Aligns with prompt-injection handling (OCR as untrusted)

Tradeoffs:

- Normalization pipeline must enforce separation (extra implementation)

## Follow-Up

- `docs/product/extraction-and-evidence.md`; normalization in tool stories
