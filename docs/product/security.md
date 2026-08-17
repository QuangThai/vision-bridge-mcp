# Security and Privacy

Atlas Vision MCP operates with **least privilege** and **privacy by default**.

## Threat Model (MVP)

| Risk | Mitigation |
| --- | --- |
| Prompt injection via OCR text | Mark image text as untrusted; never follow instructions from images |
| Path traversal / arbitrary file read | `ATLAS_ALLOWED_DIRS` path policy |
| Secret leakage in screenshots | Optional `ATLAS_REDACT_SECRETS`; clipboard, attachment, and tool-result temp files deleted after analysis; no history by default |
| Provider data disclosure | Local-first; user controls provider and credentials |
| Code execution | Server does not execute code from images or tool input |
| Verbose logging of sensitive content | `ATLAS_LOG_IMAGE_CONTENT=false` by default |

## Path Policy

- Read source files **only** from allowed directories (default: `.` = cwd).
- Support absolute paths within allowed roots.
- Reject paths outside policy with actionable error (include cwd in message).
- A tool-result path fallback is permitted only for a successful Pi `read` call
  and never widens `ATLAS_ALLOWED_DIRS`.
- Explicit in-memory image blocks are attachment-like inputs, not new source-file
  reads. Atlas may write them only to its internal temp root for processing.
- Do not create durable image files or user-visible output files by default.

```env
ATLAS_ALLOWED_DIRS=.
```

## Privacy Defaults

```env
ATLAS_STORE_HISTORY=false
ATLAS_LOG_LEVEL=info
ATLAS_LOG_IMAGE_CONTENT=false
ATLAS_REDACT_SECRETS=true
```

- No image history or durable persistence unless explicitly enabled in future.
- Clipboard tools and Pi interception may create temporary image files only for
  the duration of one call, then delete them in a `finally` cleanup path.
- No logging of image bytes or extracted text unless `ATLAS_LOG_IMAGE_CONTENT=true`.
- Provider sends image to the configured vision API — document this in README.

## OCR and Prompt Injection

- All text extracted from images is **untrusted evidence**
- Output must include security note when OCR text is present
- Example: screenshot containing "Ignore previous instructions" → returned as visible text only

## Secret Redaction

When `ATLAS_REDACT_SECRETS=true`, redact common patterns from OCR output:

- API keys, tokens, passwords (heuristic patterns)
- Report redactions in `warnings` or dedicated findings

## Operational Rules

- Do not upload images unless a tool is explicitly invoked or a configured hook is enabled.
- Do not persist image history by default.
- Clipboard-, attachment-, and tool-result-derived files are internal inputs:
  Atlas temporarily permits only its generated temp directory for that call and
  deletes the files afterward.
- Tool-result interception accepts explicit image blocks. It does not scan
  arbitrary result text, directory listings, search output, or unrelated tool
  inputs for paths.
- Local readability does not grant remote disclosure permission: source-file
  fallbacks remain subject to `ATLAS_ALLOWED_DIRS`.
- Clipboard image extraction is cross-platform best-effort: Windows uses PowerShell Desktop, macOS uses `pngpaste`/AppleScript, and Linux uses `wl-paste`/`xclip`.
- MCP server runs locally via stdio for MVP.

## Source

Derived from `SPEC.md` §4 (Laws 2, 8, 9), §5.6, §14 (Risks 4–5, 7).
