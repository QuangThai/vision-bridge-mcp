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

Live provider checks are intentionally local/manual by default to control API
spend. Do not add `VISION_API_KEY` as a GitHub Actions secret unless a maintainer
explicitly opts into provider-spend CI. Before release, run these locally when a
valid provider key is available:

```bash
pnpm test:e2e
pnpm test:golden
```

In GitHub Actions, `e2e-tests` and `golden-eval` are expected to skip when the
secret is absent; the required non-provider gate is `check`.

## Release order

1. Commit and merge the release changes.
2. Bump `version` in `package.json` and `src/constants.ts` together, finalize
   `CHANGELOG.md`, and push the release commit.
3. Wait for the release commit's required CI checks to pass.
4. Create and push the matching tag (for example `v1.4.0`) and publish the
   GitHub release notes.
5. Wait for the tag-triggered `Publish` workflow validation to pass.
6. Publish to npm, then run the post-publish smoke check.

Do not publish the npm version before the commit, changelog, tag, release notes,
and CI evidence exist.

## Versioning

Keep `package.json`, `src/constants.ts`, and the package metadata test on the
same version. The git tag must match that version exactly.

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

Manual publication is the default release path:

1. Confirm the tag-triggered `Publish` workflow completed successfully.
2. `npm login` (one-time) or authenticate via automation token (see above).
3. Confirm the version does not already exist with `npm view atlas-vision-mcp versions --json`.
4. `npm publish --access public` (if scoped later, adjust accordingly).
5. Confirm the package page lists `README.md`, `dist/`, `extensions/`, and `hooks/`.

CI publication is opt-in. It runs only when the repository variable
`NPM_PUBLISH_FROM_CI` is set to `true` and a valid `NPM_TOKEN` secret is
available. Without that explicit opt-in, tag pushes validate the release but do
not publish it.

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
