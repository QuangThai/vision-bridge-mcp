# Pi harness integration

Auto-intercept images for text-only main models when using [pi](https://github.com/anomalyco/opencode).

This is **not** the MCP stdio server. Pi installs the extension hook; vision runs in-process via the `atlas-vision-mcp` library API.

## Install (recommended)

After the package is published with the `pi` manifest:

```bash
pi install npm:atlas-vision-mcp
```

Project-local:

```bash
pi install -l npm:atlas-vision-mcp
```

Try without installing:

```bash
pi -e npm:atlas-vision-mcp
```

## Configuration

The extension **auto-loads** env files on startup — no manual export needed. Create a `.env` file in your project root:

```bash
cp examples/atlas-vision.env.example .env
# then edit .env with your API keys
```

Or use the global location (shared across all projects):

```bash
mkdir -p ~/.config/atlas-vision
cp examples/atlas-vision.env.example ~/.config/atlas-vision/env
```

The extension tries these locations in order (first found wins):

| Location | Scope |
|---|---|
| `$ATLAS_VISION_ENV_FILE` | Explicit override |
| `~/.config/atlas-vision/env` | Global (all projects) |
| `{project}/.env` | Project root |

Existing `process.env` values (e.g. from shell exports) always take priority over file values.

### Required variables

```bash
VISION_API_KEY=your-key
VISION_BASE_URL=https://api.openai.com/v1
VISION_MODEL=gpt-4o-mini
VISION_PROVIDER=openai-compatible
```

### Optional variables

| Variable | Default | Purpose |
|---|---|---|
| `MAIN_MODEL_REF` | auto-detected | Override model ref (e.g. `deepseek/deepseek-v4-flash`) |
| `ATLAS_SKIP_INTERCEPT` | `false` | Disable auto-intercept |
| `ATLAS_FORCE_INTERCEPT` | `false` | Always run Atlas even if model supports images |

## Develop in this repo

```bash
pnpm build
pi   # loads .pi/extensions/ → extensions/atlas-vision-intercept.ts
```

Requires `dist/` because the published extension imports `../dist/index.js`.

## How it works

```text
User prompt (+ optional attached images)
  → pi extension: before_agent_start
  → ctx.model.input lacks "image"?
  → Atlas analyze/ocr/ui tool(s) in-process
  → inject <atlas-vision-evidence> message
  → main model continues with text evidence
```

## MCP vs pi package vs hooks

| Path | What you get |
| --- | --- |
| `pi install npm:atlas-vision-mcp` | Auto-intercept pi extension |
| MCP config (`npx atlas-vision-mcp`) | stdio MCP tools for Cursor / other MCP clients |
| User-prompt hooks | Auto-intercept for Cursor, Codex, Claude, Droid — see [`HOOKS_INTEGRATION.md`](./HOOKS_INTEGRATION.md) |

Use pi package on pi; use hooks on other agents; use MCP for on-demand tools everywhere.

## Verify

```bash
MAIN_MODEL_REF=deepseek/deepseek-v4-flash atlas-vision doctor
atlas-vision capabilities deepseek/deepseek-v4-flash
```

## Programmatic API

```ts
import { interceptImagesForTextModel } from "atlas-vision-mcp";

const { messageText, intercepted, evidenceBlocks } = await interceptImagesForTextModel({
  mainModelRef: "deepseek/deepseek-v4-flash",
  messageText: "Fix ./screenshots/error.png",
  runtimeSupportsVision: false,
});
```

See also `examples/pi-harness-intercept.ts`.
