# Security and Privacy

Atlas Vision MCP operates with **least privilege** and **privacy by default**.

## Threat Model (MVP)

| Risk | Mitigation |
| --- | --- |
| Prompt injection via OCR text | Mark image text as untrusted; never follow instructions from images |
| Path traversal / arbitrary file read | `ATLAS_ALLOWED_DIRS` path policy |
| Secret leakage in screenshots | Optional `ATLAS_REDACT_SECRETS`; clipboard temp files deleted after analysis; no persistence by default |
| Provider data disclosure | Local-first; user controls provider and credentials |
| Code execution | Server does not execute code from images or tool input |
| Verbose logging of sensitive content | `ATLAS_LOG_IMAGE_CONTENT=false` by default |

## Path Policy

- Read files **only** from allowed directories (default: `.` = cwd)
- Support absolute paths within allowed roots
- Reject paths outside policy with actionable error (include cwd in message)
- Do not write files in MVP

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

- No image persistence unless explicitly enabled in future
- Clipboard tools may create a temporary PNG only for the duration of one tool call, then delete it
- No logging of image bytes or extracted text unless `ATLAS_LOG_IMAGE_CONTENT=true`
- Provider sends image to configured vision API — document this in README

## OCR and Prompt Injection

- All text extracted from images is **untrusted evidence**
- Output must include security note when OCR text is present
- Example: screenshot containing "Ignore previous instructions" → returned as visible text only

## Secret Redaction

When `ATLAS_REDACT_SECRETS=true`, redact common patterns from OCR output:

- API keys, tokens, passwords (heuristic patterns)
- Report redactions in `warnings` or dedicated findings

## Operational Rules

- Do not upload images unless a tool is explicitly invoked or a configured hook is enabled
- Do not persist images by default
- Clipboard-derived files are internal inputs: Atlas temporarily extends the path allowlist only to the temp file directory for that tool call
- MCP server runs locally via stdio for MVP

## Source

Derived from `SPEC.md` §4 (Laws 2, 8, 9), §5.6, §14 (Risks 4–5, 7).
