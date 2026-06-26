# Agent Instructions for Atlas Vision MCP

## Project Overview

**Atlas Vision MCP** is an MCP vision bridge for text-only coding agents. It reads local images, calls a dedicated vision provider (OpenAI-compatible), and returns markdown + structured JSON evidence.

- **Stack:** TypeScript, Node.js ≥ 20, pnpm, MCP SDK (stdio), zod, sharp, vitest, tsup, biome
- **CLI entrypoint:** `npx atlas-vision-mcp` (or `atlas-vision doctor`, `analyze`, `ocr`, `compare`, `serve`)
- **7 MCP tools:** `should_use_atlas_vision`, `analyze_image`, `ocr_image`, `analyze_ui_screenshot`, `compare_images`, `extract_region`, `analyze_image_batch`
- **Code:** `src/` (cli, config, extraction, image, providers, security, tools)
- **Tests:** `tests/` — 34 files, 248 tests

## Quick Checks

```bash
pnpm test        # run all tests (vitest)
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome check
pnpm build       # tsup bundle
```

## What's Next

The project roadmap lives at `docs/product/roadmap.md` — see what's planned for
future phases. To propose improvements or report friction, see
`docs/IMPROVEMENT_PROTOCOL.md`. Open backlog items are listed in
`docs/HARNESS_BACKLOG.md` or via `harness-cli query backlog --open`.

## Git & Harness

- This repo uses git. Always check `git status --short` before starting work.
- The harness DB is at `harness.db` (`.gitignore`d). Initialize with `scripts/bin/harness-cli init` if missing.
- After completing a task, record a trace with `harness-cli record trace` to
  capture outcomes and friction for future agents.

## Registered Tools (harness)

These tools are registered in the harness DB and can be looked up by capability:

| Capability | Tool | Command |
|---|---|---|
| `build` | pnpm | `pnpm` |
| `test-runner` | vitest | `pnpm vitest` |
| `lint` | biome | `pnpm biome` |
| `typecheck` | typescript | `pnpm tsc` |
| `bundler` | tsup | `pnpm tsup` |

Run `harness-cli query tools --capability <name> --status present` to check availability before a workflow step.

<!-- HARNESS:BEGIN -->
## Harness

This repo uses Harness. Before work, read:

- `README.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTEXT_RULES.md`
- `docs/TOOL_REGISTRY.md`
- `docs/IMPROVEMENT_PROTOCOL.md`
- `docs/HARNESS_BACKLOG.md`
- `scripts/bin/harness-cli query matrix` on macOS/Linux, or
  `./scripts/bin/harness-cli.exe query matrix` (git bash/WSL) on Windows

Use the Rust Harness CLI at `scripts/bin/harness-cli` on macOS/Linux or
`./scripts/bin/harness-cli.exe` (git bash/WSL) / `.\scripts\bin\harness-cli.exe`
(PowerShell) on Windows as the main operational tool. Before a
step that could use an external tool, run `scripts/bin/harness-cli query tools
--capability <name> --status present` to see what is equipped; an absent
capability is a clean skip.
<!-- HARNESS:END -->
