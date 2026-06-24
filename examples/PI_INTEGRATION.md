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

## Vision provider env

```bash
export VISION_API_KEY=your-key
export VISION_BASE_URL=https://api.openai.com/v1
export VISION_MODEL=gpt-4o-mini
```

Optional:

```bash
export MAIN_MODEL_REF=deepseek/deepseek-v4-flash   # override model detection
export ATLAS_SKIP_INTERCEPT=true                  # disable auto-intercept
export ATLAS_FORCE_INTERCEPT=true                 # always run Atlas on images
```

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
