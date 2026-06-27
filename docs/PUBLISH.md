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

## npm 2FA / Automation Token

If your npm account has 2FA enabled (recommended), generate an automation-level
token for CI or CLI publish instead of using `npm login` interactively:

1. Visit [npm tokens](https://www.npmjs.com/settings/~/tokens) and create a
   **token of type "Automation"** (classic token, no CIDR restriction needed).
2. Set it as an environment variable:

   ```bash
   export NPM_TOKEN="npm_xxxx…"
   ```

3. Configure `.npmrc` (in repo root or `~/.npmrc`):

   ```text
   //registry.npmjs.org/:_authToken=${NPM_TOKEN}
   ```

Automation tokens bypass 2FA for `npm publish`, `npm pack`, etc. They cannot
be used for `npm login` or destructive account actions.

## npm publish

1. `npm login` (one-time) or authenticate via automation token (see above).
2. `npm publish --access public` (if scoped later, adjust accordingly).
3. Confirm package page lists `README.md`, `dist/`, `extensions/`, and `hooks/`.

`prepublishOnly` runs `pnpm build` automatically.

## Post-publish smoke

```bash
npx -y atlas-vision-mcp@VERSION doctor
```

> **Windows note:** After publishing, the npx bin shim may not resolve
> immediately on Windows due to local cache staleness. Use `npx -y` (as shown
> above) to bypass the cache, or clear it with `npm cache clean --force` if
> `atlas-vision` command is not found.

Configure MCP clients with:

```text
npx -y atlas-vision-mcp
```
