# 0003 OpenAI-Compatible Provider First

Date: 2026-06-24

## Status

Accepted

## Context

Vision APIs vary by vendor. A single adapter pattern must maximize portability across gateways, cloud APIs, and local OpenAI-compatible servers.

## Decision

First provider implementation: **`openai-compatible`** using chat completions with `image_url` content blocks. Additional providers via `VisionProvider` interface later.

## Alternatives Considered

1. **Vendor-specific first (e.g. Gemini only)** — limits portability
2. **Multiple providers in MVP** — expands scope and test matrix

## Consequences

Positive:

- Works with OpenAI, many gateways, vLLM, and similar endpoints
- Validated pattern (Sight MCP, industry practice)

Tradeoffs:

- Non-OpenAI APIs may need adapter-specific formatting in Phase 4

## Follow-Up

- US-003 implements adapter; env vars documented in `docs/product/provider.md`
