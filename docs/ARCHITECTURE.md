# Architecture

**Stack:** TypeScript, Node.js ≥ 20, pnpm, MCP SDK (stdio), zod, sharp, vitest, tsup.
See `docs/decisions/0001-typescript-stack.md`.

Atlas Vision MCP is a **local-first vision bridge** for coding agents. It reads
local images, calls a dedicated vision provider, and returns markdown plus
structured JSON evidence.

## Runtime layout

```text
dist/
  index.js          # library exports (capabilities, tools, harness)
  cli/main.js       # CLI + MCP stdio entry (atlas-vision / npx atlas-vision-mcp)

src/
  capabilities/     # model capability lookup, image intercept, cache, cost
  cli/              # doctor, analyze, eval, hook, install-hooks, serve
  extraction/       # normalize provider output → structured evidence
  harness/          # user-prompt hooks, clipboard, session images
  image/            # read, preprocess, adaptive detail (sharp)
  providers/        # OpenAI-compatible, Responses API, Gemini, fallback
  security/         # path policy, redaction, injection guards
  tools/            # analyze_image, ocr_image, compare_images, eval, …
  server.ts         # MCP stdio server (6 tools)

extensions/         # Pi before_agent_start auto-intercept
hooks/              # shell wrappers for agent hook JSON
tests/              # unit, integration, e2e (43 files, 366 tests)
```

## Data flow

### Auto-intercept (hooks / Pi extension)

```text
User prompt (+ image paths)
  → agent hook (beforeSubmitPrompt / UserPromptSubmit / pi before_agent_start)
  → resolveMainModelRef (hook model > MAIN_MODEL_REF fallback)
  → resolveCapabilityLookup (proxy patterns > MAIN_MODEL_REF > upstream inference)
  → planImageIntercept (skip if native vision or runtime signal)
  → analyze/ocr in-process
  → inject <atlas-vision-evidence> into prompt context
  → main model continues with text evidence
```

### MCP manual mode

```text
Agent → MCP stdio → tool handler → vision provider → markdown + JSON
```

MCP tools are always exposed; the agent decides whether to call them. No
server-side auto-skip by model — use hooks for automatic routing.

## Capability resolution (proxy providers)

For `cursor/*`, `opencode-go/*`, `opencode/*`:

1. Known proxy-native patterns (`composer*`, `auto*` → vision)
2. `MAIN_MODEL_REF` when different from hook ref (unknown proxy models)
3. `CURSOR_UNDERLYING_MODEL` / `ATLAS_UNDERLYING_MODEL`
4. Upstream inference from model id prefix
5. Safe default: intercept when unknown

**Hook `model` wins over `MAIN_MODEL_REF`** — do not set a global
`MAIN_MODEL_REF` when switching between text-only and vision agents.

## Dependency rule

| Layer | Responsibility |
| --- | --- |
| `tools/` | MCP/CLI tool surfaces, orchestration |
| `capabilities/` | When to intercept, models.dev, cache |
| `providers/` | Vision API adapters |
| `image/` | Local file read + preprocess |
| `security/` | Path allowlist, redaction |
| `harness/` | Agent hook integration |

Inner modules do not depend on CLI or MCP SDK types except at boundaries.

## Observability

- Structured CLI output (`doctor`, `eval --json`, `costs`)
- Optional cost tracking (`ATLAS_TRACK_COSTS`)
- Vision response cache with LRU eviction
- Golden eval gate for CI (`eval --gate --no-cache`)

## Product contract

Detailed behavior lives in `docs/product/*` and user stories `docs/stories/US-001`
through `US-012`. Roadmap: `docs/product/roadmap.md`.
