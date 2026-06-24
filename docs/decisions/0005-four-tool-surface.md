# 0005 Four-Tool MCP Surface

Date: 2026-06-24

## Status

Accepted

## Context

Large tool sets reduce tool-selection reliability and increase context cost. Claude Code custom providers may disable tool search.

## Decision

MVP exposes exactly **four tools**: `analyze_image`, `ocr_image`, `analyze_ui_screenshot`, `compare_images`. Additional behavior uses **parameters/modes**, not new tools.

## Alternatives Considered

1. **Many specialized tools** — clearer names but worse discovery and Claude Code fallback behavior

## Consequences

Positive:

- Tools fit upfront loading with `ENABLE_TOOL_SEARCH=false`
- Clear agent mental model

Tradeoffs:

- Some modes hidden behind parameters; tool descriptions must be explicit

## Follow-Up

- Tool contracts in `docs/product/mcp-tools.md`; stories US-005, US-008–US-010
