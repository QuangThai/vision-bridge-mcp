# Changelog

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
