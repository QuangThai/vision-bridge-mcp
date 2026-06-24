# Publish checklist (v0.1.x)

Manual npm publish is acceptable for the first release. Run locally before tagging.

## Pre-publish verification

```bash
cd "D:/Personal/vision-bridge-mcp"
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
npx atlas-vision-mcp doctor
```

With valid `VISION_API_KEY`, optionally smoke-test:

```bash
npx atlas-vision-mcp analyze ./path/to/image.png --json
```

## Versioning

1. Bump `version` in `package.json` and `src/constants.ts` together.
2. Commit the version bump.
3. Tag: `git tag v0.1.0` (match package version).

## npm publish

1. `npm login` (one-time).
2. `npm publish --access public` (if scoped later, adjust accordingly).
3. Confirm package page lists `README.md` and `dist/`.

`prepublishOnly` runs `pnpm build` automatically.

## Post-publish smoke

```bash
npx -y atlas-vision-mcp@0.1.0 doctor
```

Configure MCP clients with:

```text
npx -y atlas-vision-mcp
```

## Release notes (template)

- MCP stdio server with four tools: `analyze_image`, `ocr_image`, `analyze_ui_screenshot`, `compare_images`
- CLI: `doctor`, `analyze`, `ocr`, `compare`, `serve`
- OpenAI-compatible vision provider
- Path policy, secret redaction, prompt-injection warnings
- Integration examples under `examples/`

## Not in MVP

- HTTP/SSE transport
- Remote `image_url` input
- Image persistence / history store
