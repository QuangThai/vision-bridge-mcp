# Multi-agent auto-intercept hooks

Atlas can auto-run vision **before** the main model sees a prompt on every major coding agent — not only pi.

## Two integration paths

| Path | Clients | Mechanism |
| --- | --- | --- |
| **Pi package** | pi only | `pi install npm:atlas-vision-mcp` → `before_agent_start` extension |
| **User-prompt hook** | Cursor, Codex, Claude Code, Droid | `UserPromptSubmit` / `beforeSubmitPrompt` → `atlas-vision hook user-prompt` |
| **MCP only** | Any MCP client | Tools available; agent must choose to call them |

For your goal (text-only model + image → vision runs automatically), use **pi package** on pi and **user-prompt hooks** everywhere else.

## Quick start (config file approach)

```bash
# 1. Create config file (replaces all env vars)
npx atlas-vision-mcp config init
# Edit atlas-vision.toml: set api_key, base_url, model

# 2. Install hooks (auto-reads config file, no env exports needed)
npx atlas-vision-mcp install-hooks cursor
```

The hooks load `atlas-vision.toml` automatically using the same search order:
`./atlas-vision.toml` → `~/.config/atlas-vision/config.toml`.

## Required env (only if no config file)

```bash
export VISION_API_KEY=your-key
export VISION_BASE_URL=https://api.openai.com/v1
export VISION_MODEL=gpt-4o-mini
export MAIN_MODEL_REF=deepseek/deepseek-v4-flash   # provider/model id
```

Optional (debug only — keep `false` in production):

```bash
export ATLAS_SKIP_INTERCEPT=true          # disable all auto-intercept
# export ATLAS_FORCE_INTERCEPT=true       # force intercept even for vision models (debug)
export CURSOR_UNDERLYING_MODEL=openai/gpt-4o   # upstream model when hook ref is cursor/*
```

## Hook command

```bash
# stdin: hook JSON from the agent; stdout: hook JSON with injected evidence
atlas-vision hook user-prompt [--client cursor|codex|claude|droid]
```

After `pnpm build`, project hooks can call:

```bash
node hooks/atlas-vision-user-prompt.mjs --client cursor
```

Or from npm (post-publish):

```bash
npx atlas-vision-mcp hook user-prompt --client claude
```

## Per-client setup

### Cursor

Copy `examples/hooks/cursor-hooks.json` → `.cursor/hooks.json`.

Includes:

- `beforeSubmitPrompt` → auto vision intercept
- `postToolUse` (matcher `Write`) → captures drag-drop images saved under `.cursor/projects/.../assets/` for the **next** prompt

Use `npx -y atlas-vision-mcp hook ...` after publish, or `node hooks/*.mjs` in this repo after `pnpm build`.

### Hook environment (Codex + all agents)

Hooks load vision credentials without shell exports from (first match wins per key; process env is never overridden):

1. `ATLAS_VISION_ENV_FILE` (optional explicit path)
2. `<project>/.env`
3. `~/.config/atlas-vision/env` ← **recommended for Codex**
4. `~/.atlas-vision.env`

Template: [`examples/atlas-vision.env.example`](./atlas-vision.env.example)

```bash
mkdir -p ~/.config/atlas-vision
cp examples/atlas-vision.env.example ~/.config/atlas-vision/env
# edit VISION_API_KEY, MAIN_MODEL_PROVIDER, etc.
```

### Codex

Merge `examples/hooks/codex-hooks.json` into `~/.codex/hooks.json` or `.codex/hooks.json`, or use inline `[hooks]` in `config.toml` — see [`examples/codex-config.toml`](./codex-config.toml). Trust the hook via `/hooks` on first run.

**Custom provider (DeepSeek / GLM):** Codex sends the active `model` slug in hook stdin (e.g. `deepseek-v4-flash`). Atlas maps it to models.dev as `deepseek/deepseek-v4-flash` automatically, or uses `MAIN_MODEL_PROVIDER`:

```bash
export MAIN_MODEL_PROVIDER=deepseek   # or glm
# optional explicit override:
export MAIN_MODEL_REF=deepseek/deepseek-v4-flash
```

Use models.dev provider ids (`deepseek`, `glm`), not your custom `model_provider` id (`deepseek-proxy`).

### Claude Code

Merge `examples/hooks/claude-settings.json` into `~/.claude/settings.json` or `.claude/settings.json`.

### Factory Droid

Droid supports **two complementary paths**:

| Mode | When to use | Setup |
| --- | --- | --- |
| **Auto-intercept (hooks)** | Text-only main model (`noImageSupport`) | `install-hooks droid` + `MAIN_MODEL_REF=deepseek/deepseek-v4-flash` |
| **MCP manual** | Agent explicitly calls vision tools | `droid mcp add atlas-vision ...` |

For proxy/vision main models (Composer, GPT, Opus), hooks **skip** Atlas automatically when:
- Hook sends `supports_vision` / `input_modalities: ["text","image"]`, or
- Model ref resolves as vision-native (`cursor/composer-2.5`, `openai/gpt-4o`, …)

Merge `examples/hooks/droid-hooks.json` into `~/.factory/hooks.json` or project `hooks.json`, or:

```bash
npx atlas-vision-mcp install-hooks droid
```

**MCP-only (manual tool calls):**

```bash
droid mcp add atlas-vision "npx -y atlas-vision-mcp" \
  --env VISION_PROVIDER=openai-compatible \
  --env VISION_BASE_URL=https://api.openai.com/v1 \
  --env VISION_API_KEY=YOUR_KEY \
  --env VISION_MODEL=gpt-4o-mini
```

Use MCP with text-only main models. Do **not** rely on MCP auto-routing — the agent must choose to call tools. Prefer hooks for automatic intercept.

### OpenCode

Core OpenCode uses MCP (`examples/opencode.jsonc`). For auto-intercept, either:

- run **pi** with `pi install npm:atlas-vision-mcp`, or
- use an OpenCode plugin that supports `UserPromptSubmit` hooks (e.g. opencode-hooks-plugin) with the same `atlas-vision hook user-prompt` command.

## Flow

```text
User prompt (+ optional image paths)
  → agent UserPromptSubmit / beforeSubmitPrompt hook
  → atlas-vision hook user-prompt
  → models.dev: main model lacks vision?
  → Atlas analyze/ocr in-process
  → inject <atlas-vision-evidence> via additional_context
  → main model continues with text evidence
```

## Verify

```bash
# Routing smoke (no API key)
pnpm smoke:agents

# Live hook intercept (needs VISION_API_KEY)
pnpm test:e2e -- tests/e2e/agent-hooks.e2e.test.ts

MAIN_MODEL_REF=deepseek/deepseek-v4-flash atlas-vision doctor
echo '{"prompt":"fix ./shot.png","hook_event_name":"UserPromptSubmit","model":"deepseek-v4-flash","cwd":"."}' \
  | MAIN_MODEL_REF=deepseek/deepseek-v4-flash atlas-vision hook user-prompt --client codex
```

With `VISION_API_KEY` set, stdout should contain `additional_context` with `<atlas-vision-evidence>`.

## MCP still needed?

Yes — keep MCP configured if you also want on-demand tools (`compare_images`, `extract_region`, batch). The hook path handles **automatic** first-pass vision; MCP tools remain for explicit agent calls.
