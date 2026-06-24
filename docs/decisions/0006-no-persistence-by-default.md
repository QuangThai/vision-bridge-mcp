# 0006 No Persistence by Default

Date: 2026-06-24

## Status

Accepted

## Context

Screenshots may contain secrets, PII, and proprietary code. Storing evidence increases privacy and compliance risk.

## Decision

Default: **no image persistence**, **no evidence history** (`ATLAS_STORE_HISTORY=false`). Optional local JSONL/SQLite deferred post-MVP.

## Alternatives Considered

1. **Always store evidence** — enables Ask Atlas sooner but violates privacy-by-default

## Consequences

Positive:

- Local-first, minimal data retention
- Simpler MVP security posture

Tradeoffs:

- Ask Atlas and cross-session queries require future opt-in storage

## Follow-Up

- US-011 enforces defaults; `docs/product/security.md`
