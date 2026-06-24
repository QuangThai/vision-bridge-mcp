# Publish checklist

Manual npm publish is acceptable. Run locally before tagging.

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
3. Tag: `git tag v0.2.1` (match package version).

## npm publish

1. `npm login` (one-time).
2. `npm publish --access public` (if scoped later, adjust accordingly).
3. Confirm package page lists `README.md`, `dist/`, `extensions/`, and `hooks/`.

`prepublishOnly` runs `pnpm build` automatically.

## Post-publish smoke

```bash
npx -y atlas-vision-mcp@VERSION doctor
```

Configure MCP clients with:

```text
npx -y atlas-vision-mcp
```
