# CLI

The CLI lets developers test Atlas Vision without a coding agent.

## Binary Name

`atlas-vision` (via package bin)

## Commands

### `doctor`

```bash
atlas-vision doctor
```

Checks: Node version, provider env vars, API connectivity, model availability, allowed dirs, image processing dependencies.

### `analyze`

```bash
atlas-vision analyze ./screenshot.png --mode ui
```

| Option | Values |
| --- | --- |
| `--mode` | `general`, `ui`, `diagram`, `chart`, `error_screenshot`, `code_from_screenshot` |
| `--detail` | `brief`, `standard`, `detailed` |
| `--json` | machine-readable output |
| `--save` | write JSON to file |

### `ocr`

```bash
atlas-vision ocr ./error.png --preserve-layout
```

### `compare`

```bash
atlas-vision compare ./before.png ./after.png --focus layout
```

### `serve`

```bash
atlas-vision serve --transport stdio
```

Future: `--transport http --port 3333`

## Output Format

Human-readable sections:

```text
Summary: ...
Verified evidence: ...
Inferred: ...
Uncertain: ...
```

With `--json`, emit normalized Atlas schema.

## Source

Derived from `SPEC.md` §3.3, §11.
