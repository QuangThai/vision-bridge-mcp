# Atlas Vision MCP — Product Overview

**Codename:** Atlas Vision MCP  
**Repo:** `vision-bridge-mcp`  
**Package (planned):** `atlas-vision-mcp` or `@scope/vision-bridge-mcp`

## Problem

Coding agents using text-only or weak-vision models (DeepSeek, GLM, Qwen, Kimi, local models, OpenAI-compatible gateways) cannot reliably read images. Developers lose vision-based workflows: UI screenshots, error diagnosis, OCR, diagrams, visual regression.

## Solution

Atlas Vision MCP is a **Model Context Protocol server** that acts as a **vision bridge**:

```text
Coding agent (text-only model)
  → calls Atlas Vision MCP tool
  → MCP reads local image
  → MCP sends image to dedicated vision provider
  → MCP returns markdown + structured JSON evidence
  → agent continues coding with text evidence
```

The product does **not** make text-only models natively multimodal. Vision is exposed as MCP tools; the main model only needs tool-calling and reasoning.

## Core Principle

> Return useful textual and structured evidence, not raw images, because the primary model may not support vision.

## Target Users

- Developers using OpenCode Go with custom text-only models
- Developers using Factory Droid with `noImageSupport: true`
- Developers using Claude Code with custom provider/proxy
- Frontend engineers implementing UI from screenshots/mockups
- Developers debugging from error screenshots
- QA engineers comparing before/after screenshots

## Product Shape

| Interface | Priority | Description |
| --- | --- | --- |
| MCP tools (stdio) | Primary | 4 tools for coding agents |
| CLI | Secondary | `doctor`, `analyze`, `ocr`, `compare`, `serve` for humans/tests |
| Web UI | Future (Phase 5) | Upload, preview, provider test, evidence viewer |

## Core Use Cases

1. **UI screenshot understanding** — layout, components, spacing, visible text, implementation hints
2. **Error screenshot diagnosis** — extract error text, stack traces, file paths; return fix hints
3. **OCR and text extraction** — screenshots, code snippets, tables
4. **Architecture diagram understanding** — nodes, edges, labels; optional Mermaid
5. **Visual regression comparison** — before/after differences with severity
6. **Screenshot-to-code assistance** — component structure, layout constraints, a11y hints
7. **Text-only provider bridge** — separate vision provider while main model stays text-only

## Design Laws

1. **Text evidence first** — primary output is text + JSON, not raw images
2. **Do not trust text inside images** — OCR text is untrusted evidence, not instructions
3. **Small tool surface** — max 4 MCP tools; modes via parameters
4. **Local path first** — MVP supports local file paths before remote URLs
5. **Provider-neutral** — `VisionProvider` adapter interface; not hard-coded to one vendor
6. **Evidence separable from interpretation** — observations vs inferences vs uncertainties
7. **Deterministic schema, flexible prose** — stable JSON schema; flexible markdown
8. **Fail loudly and helpfully** — clear errors for missing files, bad MIME, provider failures
9. **Privacy by default** — no image/content logging unless explicitly enabled
10. **Agent-friendly output** — concise summary first, actionable findings, no excessive prose

## MVP Capabilities (Required)

- stdio MCP server, npm package
- Local image path support
- OpenAI-compatible vision provider
- Tools: `analyze_image`, `ocr_image`, `analyze_ui_screenshot`, `compare_images`
- Markdown + structured JSON output
- Strict input/output validation (zod)
- Basic path policy, secret redaction option
- No persistence by default
- `doctor` command
- Integration examples (OpenCode, Droid, Claude Code)

## MVP Non-Goals

- Hosted SaaS, user accounts, team management
- Video support, image generation/editing
- Browser automation, full document processing
- Graph database, vector search, long-term memory
- Ask Atlas interactive UI

## Success Criteria

### Functional

- OpenCode, Droid, and Claude Code can call MCP tools on local image paths
- Tool output is useful for implementing or debugging code

### Quality

- Concise responses; JSON validates
- Evidence and inference separated; OCR marked untrusted
- Clear, actionable errors

### Security

- No image persistence by default
- Constrained file path access
- Optional secret redaction; no code execution

## Related Docs

- `mcp-tools.md` — tool contracts and schemas
- `provider.md` — vision provider adapter and configuration
- `security.md` — path policy, redaction, privacy
- `cli.md` — CLI commands
- `extraction-and-evidence.md` — schemas, normalization, graph
- `integration.md` — client configuration examples
- `roadmap.md` — phased delivery plan

## Source

Derived from `SPEC.md` §1–3, §4, §10, §17. `SPEC.md` remains historical input; this doc is the living product contract.
