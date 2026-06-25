# Atlas Vision — Agent Hook Examples

## Droid

Set these env vars in your shell rc or droid profile:

```bash
# Required: vision provider
export VISION_API_KEY="your_key"
export VISION_BASE_URL="https://api.openai.com/v1"
export VISION_MODEL="gpt-4o-mini"

# Model detection (P0 improvements)
export MAIN_MODEL_REF="deepseek/deepseek-v4-flash"
export ATLAS_INTERCEPT_MODE="text-only-only"   # only bridge text-only models

# Clipboard (for noImageSupport models)
export ATLAS_CLIPBOARD_DETECT="smart"
export MAIN_MODEL_PROVIDER="zhipuai"           # for GLM models
```

Then configure `droid-hooks.json` in your project or `~/.factory/hooks.json`.

## Cursor

See [`cursor-hooks.json`](./cursor-hooks.json) and the [Cursor Hooks forum](https://forum.cursor.com/t/image-attached-to-user-prompt-is-not-picked-up-by-hooks/161895).

The `beforeSubmitPrompt` hook runs Vision intercept before the agent sees the prompt.
Set `MAIN_MODEL_REF` env in your Cursor process to enable model-specific gating.

## Codex

See [`codex-hooks.json`](./codex-hooks.json).

## Claude Code

See [`claude-settings.json`](./claude-settings.json).

---

## New env vars (v0.4.0+)

| Env | Values | Description |
|-----|--------|-------------|
| `ATLAS_INTERCEPT_MODE` | `auto` (default), `text-only-only`, `always`, `never` | Control intercept behavior |
| `MAIN_MODEL_REF` | `provider/model` (e.g. `deepseek/deepseek-v4-flash`) | Explicit model ref |
| `MAIN_MODEL_PROVIDER` | Provider slug (e.g. `zhipuai` for GLM) | Provider for model ref inference |
| `ATLAS_CLIPBOARD_DETECT` | `off` (default), `smart`, `always` | Clipboard image detection |
