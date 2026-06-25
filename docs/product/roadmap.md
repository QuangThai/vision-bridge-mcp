# Roadmap

Phased delivery for Atlas Vision MCP. **MVP = Phase 1** (+ safety items from Phase 2 folded into MVP per §17).

## Phase 0: Research and Validation ✓

- SPEC.md, tool schema design, provider abstraction — **complete (input material)**

## Phase 1: CLI/MCP MVP ✓

- stdio MCP server, 4 tools, local paths, OpenAI-compatible provider
- markdown + structured JSON, basic tests, integration examples, `doctor`

**Stories:** US-001 through US-012

## Phase 2: Reliability and Safety ✓

- Golden fixtures (3 reference images: web + diagrams + chart)
- `atlas-vision eval` CLI command with coverage reporting
- JSON schema snapshots
- GitHub Actions CI (Node 20 + 22, lint, typecheck, test, optional E2E)

## Phase 3: Better Visual Workflows ✓

- Diagram-to-Mermaid: `mermaid` field in analyze_image output
- Chart/table extraction: `tables[]` field with structured rows
- Improved prompts for diagram and chart modes

## Phase 4: Provider Expansion ✓

- Gemini adapter (Google AI API)
- Ollama via openai-compatible adapter (localhost:11434/v1)
- Provider router, "gemini" config value

## Phase 5: Enhanced Tools ✓

- `extract_region`: crop and analyze a specific region of an image
- `analyze_image_batch`: process multiple images in a single call
- 8 golden fixtures (was 4) with diverse image types
- Improved prompts for all analyze_image modes
- Edge case test coverage (108 tests, was 90)
- Gemini health check fix (POST instead of GET)

## Phase 6: Web UI MVP (deferred)

- Local dashboard: upload, preview, JSON/graph viewer, integration generator

## Phase 7: Team/Remote Mode (deferred)

- HTTP/SSE transport, Docker, optional persistence, audit logs

## Explicitly Deferred

- Ask Atlas query UI
- Video, PDF (raw), image editing
- Hosted SaaS, accounts, team permissions

## Source

Derived from `SPEC.md` §10, §17.
