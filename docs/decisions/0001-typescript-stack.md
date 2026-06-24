# 0001 TypeScript Stack

Date: 2026-06-24

## Status

Accepted

## Context

Atlas Vision MCP must distribute easily to coding-agent users (npx, stdio MCP). The stack must align with MCP SDK examples and npm publishing.

## Decision

Use **TypeScript** on **Node.js ≥ 20**, **pnpm**, **tsup** build, **vitest** tests, **zod** validation, **eslint/prettier** (or biome).

## Alternatives Considered

1. **Python** — stronger for local VLMs later, but heavier setup and weaker npx-style distribution for MCP clients.

## Consequences

Positive:

- Strong MCP TypeScript ecosystem and examples
- Simple npm/npx distribution for OpenCode, Droid, Claude Code

Tradeoffs:

- Local vision backends may need a future optional Python worker

## Follow-Up

- Record project structure in US-001 when package skeleton lands
