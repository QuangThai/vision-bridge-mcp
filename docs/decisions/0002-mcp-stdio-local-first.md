# 0002 MCP Stdio Local-First

Date: 2026-06-24

## Status

Accepted

## Context

Most screenshots and project assets live on the developer machine. Coding agents already run locally with stdio MCP.

## Decision

MVP ships **stdio transport only**, reading **local file paths** first. HTTP/SSE deferred to Phase 6.

## Alternatives Considered

1. **HTTP/SSE first** — better for teams but adds deployment and auth complexity before core tools work.

## Consequences

Positive:

- Simplest integration for OpenCode, Droid, Claude Code
- Aligns with private screenshot workflows

Tradeoffs:

- Remote/team mode requires later transport work

## Follow-Up

- US-007 implements stdio MCP server
