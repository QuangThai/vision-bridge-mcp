# Roadmap

Phased delivery for Atlas Vision MCP. **MVP = Phase 1** (+ safety items from Phase 2 folded into MVP per §17).

## Phase 0: Research and Validation ✓

- SPEC.md, tool schema design, provider abstraction — **complete (input material)**

## Phase 1: CLI/MCP MVP (current)

- stdio MCP server, 4 tools, local paths, OpenAI-compatible provider
- markdown + structured JSON, basic tests, integration examples, `doctor`

**Stories:** US-001 through US-012

## Phase 2: Reliability and Safety

- Golden fixtures, `atlas-vision eval`, JSON schema snapshots
- Hardening beyond MVP baseline (may overlap US-011)

## Phase 3: Better Visual Workflows

- Improved UI/diff modes, diagram-to-Mermaid, chart/table extraction

## Phase 4: Provider Expansion

- Gemini, Z.AI/GLM, Anthropic, Ollama adapters; fallback routing

## Phase 5: Web UI MVP

- Local dashboard: upload, preview, JSON/graph viewer, integration generator

## Phase 6: Team/Remote Mode

- HTTP/SSE transport, Docker, optional persistence, audit logs

## Explicitly Deferred

- Ask Atlas query UI
- Video, PDF (raw), image editing
- Hosted SaaS, accounts, team permissions

## Source

Derived from `SPEC.md` §10, §17.
