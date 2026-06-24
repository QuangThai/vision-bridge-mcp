# 0004 Text and JSON Evidence Output

Date: 2026-06-24

## Status

Accepted

## Context

Main coding models may reject image blocks or lack vision entirely. MCP must return consumable evidence for text-only reasoning.

## Decision

Primary tool output is **markdown summary + structured JSON**. Raw image content is not returned to the main model.

## Alternatives Considered

1. **Return image URLs/base64 to agent** — breaks text-only providers and increases context cost

## Consequences

Positive:

- Works with DeepSeek, GLM, custom proxies, `noImageSupport` models
- Auditable, parseable evidence

Tradeoffs:

- Vision quality depends on separate provider; no inline multimodal in main model

## Follow-Up

- Extraction/normalization in US-005+; schemas in `docs/product/extraction-and-evidence.md`
