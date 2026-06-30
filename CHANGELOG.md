# Changelog

## 1.0.6 - 2026-06-30

### Added

- **Pi package gallery preview** — added a clean `pi.image` preview asset for
  `https://pi.dev/packages/atlas-vision-mcp` so the package renders with a clear,
  non-overflowing UI card in the Pi gallery.
- **Pi package discoverability** — expanded npm keywords with `pi-extension`,
  `ocr`, and `screenshot`.

### Documentation

- Added a Pi-specific security note explaining local extension permissions, image
  and clipboard reads, provider upload behavior, and config review points.
- Clarified that `pi install npm:atlas-vision-mcp` is the supported distribution
  path; git install is not currently supported because the extension imports
  built files from the npm tarball.
- Converted README docs/examples links to GitHub absolute links so they work
  correctly from npm and Pi package pages.

### Validation

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` - 49 files, 442 tests
- `npm pack --dry-run --json`

## 1.0.5 - 2026-06-29

### Fixed

- **`npx atlas-vision-mcp` package execution** — added the `atlas-vision-mcp`
  bin alias alongside `atlas-vision`, so MCP clients can run the package by name
  on Windows and other platforms.
- **Cross-platform clipboard image reads** — clipboard tools now support macOS
  (`pngpaste` or AppleScript fallback) and Linux (`wl-paste` or `xclip`) in
  addition to Windows PowerShell Desktop.
- **Clipboard platform documentation** — README and product docs now list the
  Windows/macOS/Linux backends and limitations.

### Validation

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` - 49 files, 442 tests
- `pnpm build`
- `npm publish --dry-run`

## 1.0.4 - 2026-06-29

### Added

- **Clipboard-first MCP tools** — `analyze_clipboard`, `ocr_clipboard`,
  `diagnose_clipboard`, and `analyze_ui_clipboard` let text-only agents read the
  current OS clipboard image directly instead of relying on native image
  attachments.
- **OpenCode/Droid clipboard workflow docs** — documented that native `Alt+V`
  attachments are still client-internal, while Atlas clipboard tools read the OS
  clipboard directly.

### Fixed

- **Windows clipboard image reads** — PowerShell clipboard extraction now runs in
  STA mode so `Get-Clipboard -Format Image` works reliably from the MCP server.
- **MCP stdio registration parity** — `serveStdio()` now registers the same
  vision tools as `createAtlasMcpServer()`, including clipboard tools.

### Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` - 49 files, 442 tests
- `pnpm build`
- E2E verified with OpenCode DeepSeek/GLM and Droid DeepSeek/GLM calling
  clipboard tools against a real Windows clipboard image.

## 1.0.3 - 2026-06-29

### Fixed

- **Gemini `media_resolution` enum format** — `mapDetailToMediaResolution()` now
  uses correct proto enum names (`MEDIA_RESOLUTION_LOW`, `MEDIA_RESOLUTION_ORIGINAL`)
  instead of lowercase strings that were rejected by the API.
- **Gemini model version gate** — `media_resolution` is now only sent for
  Gemini 3+ models (where the API supports it). Older models (gemini-2.x)
  skip the parameter entirely, avoiding `Invalid value` errors.

### Added

- **`supportsMediaResolution(model)`** — exported helper to check Gemini model
  version compatibility.
- **Gemini E2E tests** — `tests/e2e/gemini-e2e.test.ts` (24 tests) covering
  all 7 tools against real Gemini models. Plus multi-model smoke suite
  `tests/e2e/gemini-multi-model.test.ts` for cross-version verification.

### Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` - 48 files, 434 tests
- `pnpm build`
- E2E verified on `gemini-3.5-flash` (17/24 pass, 7 quota-skipped)
- E2E verified on `gemini-3.1-flash-lite` (4/4 core tools pass)

## 1.0.2 - 2026-06-28

### Fixed

- **CLI eval env loading** - `atlas-vision eval` now loads local `.env` values
  before resolving provider config, matching E2E hook behavior. This lets
  `pnpm test:golden` run directly in local release checks without a shell env
  wrapper.
- **Version metadata sync** - CLI/package version constant now matches the npm
  package version.

### Validation

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test` - 48 files, 434 tests
- `pnpm build`
- `pnpm test:golden` - 16/16 snapshots, zero gate failures

## 1.0.0 — 2026-06-27

### Added

- **Anthropic Claude provider** — Messages API adapter with `x-api-key` auth
  and `anthropic-version: 2023-06-01` header. Content blocks for vision.
- **URL image support** — All 7 tools accept `image_url` alongside `image_path`,
  with SSRF protection (blocks private/local networks).
- **Snapshot testing** — Structural diff verification for golden fixtures.
  `--snapshot verify|update|skip` flag. CI now verifies snapshots.
- **Eval report persistence** — `--output <path>` with baseline comparison.
  Tracks overall text match rate and core pass count across runs.
- **5 integration guides** — Cursor, Droid, OpenCode, Pi, Claude Code (+ generic).
- **Claude Code integration guide** — Hook setup, MCP config, settings scopes.
- **Concurrent golden eval** — Fixtures processed in parallel batches
  (concurrency=3), reducing wall-clock time.
- **CI parallel jobs** — E2E tests and golden eval run in separate parallel jobs.
- **`prepublishOnly` gates** — Tests + typecheck run before publish.

### Changed

- **Breaking (schema):** `compare_images` input now uses `before_url`/`after_url`
  alongside `before_path`/`after_path`. All optional; at least one required per image.
- **Breaking (schema):** `ocr_image`, `analyze_ui_screenshot`, `extract_region`,
  `analyze_image_batch` input schemas now accept `image_url` optionally.
- **Provider content order** — Images placed before text per Anthropic
  official docs (applies to all providers).
- **`test:golden`** — now uses `--tier core` (8 fixtures instead of 22) and
  `--snapshot verify`. Removed `--no-cache`.
- **Provider factory** — Shared `instantiateProvider()` eliminates duplicate
  switch in `createVisionProvider` and `createInnerProvider`.
- **Shared utilities** — `resolveImageSource()` extracted to `src/utils/`.

### Fixed

- **`analyzeImageBatch` output schema** — Was using `analyzeImageOutputSchema`
  instead of correct `analyzeImageBatchOutputSchema`.
- **Dashboard element thresholds** — Updated `expected_elements` to match real
  model output (`metric`, `recent`, `activity`, `dashboard`).
- **Missing LICENSE file** — MIT license added.

### Test improvements

- **465 total tests** (433 unit + 32 E2E), all passing.
- **7 E2E URL tests** — URL image loading for all tools via picsum.photos CDN.
- **11 URL schema tests** — Acceptance + missing-source rejection for all tools.
- **E2E tests now run in CI** alongside golden eval (parallel jobs).

---

## 0.9.0 — 2026-06-25

### Added

- **Multi-provider fallback** — `[provider.fallback]` in config file or
  `VISION_FALLBACK_*` env vars. When primary fails with transient error
  (timeout, 429, 5xx, network), automatically retries on secondary provider.
- **`rate_limit` error code** — new `ProviderErrorCode` for 429 responses

### Fixed

- **`_isTransientError` detection** — checks error code field first, then
  message patterns including "fetch failed", DNS, and socket errors
- **Typecheck** — removed unused `FetchFn` import and `_withFallback` params

### Changed

- **Error messages** — "Unknown command" now lists available commands;
  `costs` usage shown on flag parse failure
- **README** — documented fallback provider in config file example + env table

## 0.8.0 — 2026-06-25

### Added

- **GitHub issue templates** — bug report + feature request templates
- **PR template** — checklist for build/test/lint/typecheck
- **Shell completions** — `atlas-vision completion bash|zsh|fish` generates tab-completion
  scripts for all commands, subcommands, and flags
- **Eval text match rate** — `runEval()` now reports `text_match_rate` per fixture and
  `overall_text_match_rate` across all fixtures. Accepts `--threshold` flag
  (default 50%)
- **Eval element tracking** — `expected_elements` are now checked and reported separately

### Changed

- **Integration docs** — quickstart now recommends `atlas-vision config init` first
- **Examples README** — added config file vs env vars comparison table

## 0.7.0 — 2026-06-25

### Added

- **Config file support** — `atlas-vision.toml` / `atlas-vision.json` with layered search:
  `ATLAS_VISION_CONFIG` env → `./atlas-vision.toml` → `~/.config/atlas-vision/config.toml`
- **`atlas-vision config` CLI** — `config show`, `config path`, `config init` commands
- **Config file warnings** — warns on malformed files and unknown sections (typo detection)

### Changed

- **`config.ts`** — `loadConfig()` auto-merges config file values as env var fallbacks
  (env vars always take priority over config file)
- **`doctor` command** — shows both `.env` and config file status

### Fixed

- **Config file silent failure** — malformed config file now logs a warning instead of
  silently falling through to defaults
- **Preprocess param reassign** — `preprocessImage` no longer reassigns `detailLevel`
  parameter (lint fix). Uses `effectiveDetail` local variable for auto-detected level

## 0.6.0 — 2026-06-25

### Added

- **Adaptive detail level** — `autoDetectDetailLevel()` analyzes image content (unique color ratio,
  color variation, file-path heuristics) and auto-selects between `low` (85 tokens, 512px),
  `medium` (1024px, ~500-1700 tokens), and `high` (2048px, full detail).
- **Medium detail level** — new 1024px level between low and high. Coding screenshots (code,
  terminal, error messages) use medium — text stays readable at ~30-60% cost savings vs high.
- **`ATLAS_ADAPTIVE_DETAIL`** — env var (default `true`) controlling automatic detail detection
- **Cache LRU eviction** — `CacheStore` limits: `maxEntries` (500) + `maxSizeMb` (100 MB).
  Oldest entries auto-deleted when limits exceeded. Configurable via `ATLAS_CACHE_MAX_ENTRIES`
  and `ATLAS_CACHE_MAX_SIZE_MB`.
- **Cache savings reporting** — `CachedVisionProvider` tracks hit/miss counts; cached results
  show `⚡ Result from cache` in markdown output
- **`atlas-vision estimate <image>`** — CLI command to preview token cost per detail level
  and estimated USD cost across 8 popular models
- **`_cached` field on `RawVisionResult`** — typed boolean indicating cache origin

### Fixed

- **`preprocessImage` detail level leak** — user-facing detail level values ("standard") no longer
  passed directly to provider API. Auto-detected levels correctly return `undefined` when
  adaptive mode doesn't run, so tool layer uses `mapDetailLevel()` mapping.
- **Cache test strengthened** — LRU eviction test now asserts which entries are evicted
  (`expect(k2).toBeNull()`)

### Changed

- **`autoDetectDetailLevel`** returns `"low" | "medium" | "high"` instead of `"low" | "high"`
- **`PreprocessResult`** gains `detailLevel?: string` field
- **`LoadedImage`** gains `detailLevel?: string` field
- **`CacheStoreOptions`** gains `maxEntries` and `maxSizeMb`
- **`CacheStore.stats()`** now includes `maxEntries` and `maxSizeBytes`
- **Tools** (`analyzeImage`, `ocrImage`, `analyzeUiScreenshot`) map `"medium"` → `"high"` for
  provider API (pre-resized 1024px image tiles at 512px internally)

## 0.4.0 — 2026-06-25

### Added

- **Provider heuristics** — replace hardcoded model list with provider-level patterns:
  `openai/*`, `anthropic/*`, `google/*`, `cursor/*`, `opencode-go/*` → vision (ALL models);
  `deepseek/*`, `zhipuai/*`, `kimi/*`, `qwen/*` → text-only (ALL models)
  No more manual updates when new models are released
- **`ATLAS_INTERCEPT_MODE`** — `auto`, `text-only-only`, `always`, `never`. Controls when Atlas intercepts images.
  `text-only-only` mode: only intercepts for models KNOWN text-only (safe for cursor-sdk)
- **`ATLAS_MODEL_CAPABILITIES_FILE`** — user-provided JSON file to override capability detection
- **`should-intercept` CLI** — `atlas-vision should-intercept <provider/model>` debugs intercept decisions
- **OpenCode plugin** — `.opencode/plugin.ts` auto-intercepts images via `chat.message` hook (0 MCP calls)
- **Clipboard image detection** — `ATLAS_CLIPBOARD_DETECT=smart|always` auto-reads clipboard images (Windows)
- **`cursor/*`, `opencode-go/*` provider heuristics** — correct handling for pi-cursor-sdk bridge

### Fixed

- **`runtimeSupportsVision` logic** (extensions/atlas-vision-intercept.ts):
  `ctx.model?.input?.includes("image") ?? undefined` — only claims vision when CERTAIN.
  Text-only models (`input: ["text"]`) correctly return `false` → intercept.
  Missing `ctx.model` returns `undefined` → heuristic decides.
- **Provider alias `glm` → `zhipuai`** — `inferProviderFromModelId("glm-5.2")` now returns `"zhipuai"`
  (matching models.dev canonical ID)
- **Bundled registry priority** — `lookupBundledCapability` checked BEFORE models.dev lookup,
  preventing future models.dev changes (e.g. `deepseek-v4-flash` with `attachment: true`) from
  overriding curated exceptions
- **`inferProviderFromModelId`** — recognizes `composer-*` → `cursor` provider for Cursor model names

### Changed

- **`src/capabilities/bundled-registry.ts`** — rewritten from ~180 lines of model-specific overrides
  to ~120 lines with provider heuristics + small override list
- **`getModelCapabilities` priority** — `user overrides → bundled/heuristics → models.dev → unknown`
  (was: `user overrides → models.dev → bundled → unknown`)

## 0.3.0 — 2026-06-24

### Added

- **URL image support** — `analyze_image`, `extract_region`, `analyze_image_batch` now accept `image_url` in addition to `image_path`
- **SSRF protection** — `assertAllowedImageUrl()` blocks private/local network URLs (localhost, 10.*, 172.16-31.*, 192.168.*, .local) before download
- **`withRetry` utility** — exponential backoff with jitter for provider API calls, controlled by `VISION_RETRY_MAX` (default 3). Retries on 429, 5xx, network errors; skips auth/timeout errors
- **`setupConsoleRedirection`** — redirects stray `console.*` to stderr to protect MCP stdio protocol, only allowing JSON-RPC messages on stdout
- **Configurable `VISION_TEMPERATURE`** — new env var (default 0.1) replaces hardcoded temperature in both providers
- **Gemini `media_resolution`** — maps detail level to `media_resolution` parameter for Gemini 3+ (low/high/original)
- **Original detail level** — `detailed` now maps to `"original"` instead of `"high"`, unlocking full-resolution for GPT-5.4+ and Gemini 3+
- **Enhanced secret redaction** — 13 new patterns: npm, GitHub, GitLab, Slack tokens; Google/Stripe/Twilio/Heroku API keys; SSH keys, PEM certificates, Discord webhooks, Telegram tokens
- **PII content safety** — `checkContentSafety()` integrated into all sanitize paths (gated by `ATLAS_CHECK_PII`)
- **`mapDetailToMediaResolution`** — exported from `providers/types.ts` alongside `mapDetailLevel` for architecture consistency

### Changed

- **Image preprocessing** — two-phase strategy: Phase 1 downscales to detail-level target dimensions (low→512px, high→2048px, original→keep), Phase 2 converts format with quality aware of text-heavy content (JPEG q92 for text, q80 for photos)
- **System prompt enhanced** — added quality standards for code, diagrams, tables, text extraction with OCR character disambiguation guidance
- **Tool prompts deepened** — `analyze_image` (all modes: diagram, chart, code, error, document), `ocr_image` (layout, tables, code, OCR quality), `analyze_ui_screenshot` (element detection, accessibility, responsive, framework patterns), `compare_images` (systematic comparison, focus-specific instructions)
- **`sanitize-output.ts`** — refactored to shared helper functions (`redactField`, `addInjectionWarnings`, `addRedactionWarnings`, `addPiiWarnings`), eliminating duplication across three sanitize methods
- **Gemini URL resolution** — `buildGeminiUrl()` now checks for `generativelanguage.googleapis.com` / `googleapis.com` prefix instead of fragile OpenAI-default heuristic
- **`readImageFromPath`** — accepts `detailLevel` option passed through to `preprocessImage` for dimension optimization

### Fixed

- **OpenAI timeouts** — `withRetry` does NOT retry AbortError (non-transient), preventing cascading timeout loops
- **Schematic validation** — `analyzeImageInputSchema` allows `image_url` XOR `image_path` instead of requiring `image_path`

## 0.2.1 — 2026-06-24

### Added

- **Pi package** — `pi install npm:atlas-vision-mcp` auto-intercept extension (`extensions/`)
- **User-prompt hooks** — `atlas-vision hook user-prompt` for Cursor, Codex, Claude Code, Droid
- **Hook env files** — load `VISION_*` / `MAIN_MODEL_*` from `.env`, `~/.config/atlas-vision/env`, or `ATLAS_VISION_ENV_FILE`
- **Cursor drag-drop capture** — `atlas-vision hook capture-image` + `postToolUse` stores pasted image paths for the next prompt
- **Codex custom provider** — resolve `model` slug from hook stdin to models.dev (`deepseek/*`, `glm/*`)
- **models.dev** capability lookup, image intercept planner, CLI `capabilities` / `doctor`

### Changed

- npm package ships `dist/`, `extensions/`, `hooks/`, `README.md`

## 0.2.0

- Initial MCP vision bridge (6 tools, stdio server, CLI)
