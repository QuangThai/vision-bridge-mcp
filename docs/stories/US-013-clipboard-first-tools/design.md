# Design

## Domain Model

- Clipboard image: the current OS clipboard image captured by Atlas on explicit tool invocation.
- Temporary clipboard file: PNG saved under the OS temp directory for one tool call.
- Evidence output: existing `analyze_image`, `ocr_image`, or `analyze_ui_screenshot` structured output.

## Application Flow

1. Agent calls `analyze_clipboard`, `ocr_clipboard`, `diagnose_clipboard`, or `analyze_ui_clipboard`.
2. Atlas reads the OS clipboard image via the existing clipboard reader.
3. Atlas saves a temporary PNG.
4. Atlas internally allows that temp directory for the tool call.
5. Atlas routes through the existing image/vision pipeline.
6. Atlas deletes the temporary file after the tool call.

## Interface Contract

New MCP tools:

- `analyze_clipboard(prompt?, mode?, detail_level?)` → `AnalyzeImageOutput`
- `ocr_clipboard(preserve_layout?, extract_tables?, extract_code?)` → `OcrImageOutput`
- `diagnose_clipboard(prompt?, detail_level?)` → `AnalyzeImageOutput` with `mode=error_screenshot`
- `analyze_ui_clipboard(target_framework?, style_system?, goal?)` → `AnalyzeUiScreenshotOutput`

If no image is present, return an actionable MCP error telling the user to copy an image first and avoid native image attachment.

## Data Model

No database or durable storage changes. Clipboard temp files are deleted after analysis.

## UI / Platform Impact

No app UI. Windows clipboard support uses the existing PowerShell/Windows Forms clipboard reader; other platforms inherit current reader limitations until implemented.

## Observability

No image bytes or OCR text are logged. Existing tool failures are sanitized.

## Alternatives Considered

1. Native `Alt+V` attachment interception — not available via MCP in Droid/OpenCode today.
2. Always-on clipboard watcher/path replacement — useful later, but can disrupt normal clipboard UX in other apps.
3. Manual path-only workflow — reliable but requires saving or converting each screenshot.
