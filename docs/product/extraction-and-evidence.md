# Extraction and Evidence

Atlas Vision transforms raw vision provider output into **stable, auditable evidence** for text-only coding agents.

## Extraction Layers

```text
Layer 1: Source metadata
Layer 2: Raw visual observations
Layer 3: OCR text evidence
Layer 4: UI/diagram/component structure
Layer 5: Inferences
Layer 6: Recommended actions
Layer 7: Uncertainty and limitations
```

## Evidence Kinds

`visual`, `ocr_text`, `layout`, `ui_component`, `diagram_node`, `diagram_edge`, `error_message`, `code_snippet`, `table`, `chart`, `inference`

## Claim Status

Every claim must be tagged:

| Status | Meaning |
| --- | --- |
| `verified` | Directly visible or extracted from image |
| `inferred` | Likely explanation from verified evidence |
| `discussed` | From user/agent conversation, not image |
| `uncertain` | Low confidence or ambiguous |

## Core Types (planned)

```ts
export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  content: string;
  source: { type: "image" | "comparison"; path?: string; hash?: string; region?: ImageRegion };
  confidence: number; // 0..1
  verified: boolean;
  createdAt: string;
}
```

Specialized extractions: `UIScreenExtraction`, `OCRExtraction`, `DiagramExtraction`, `ImageComparisonExtraction` — see `SPEC.md` §7.4–7.7 for field lists.

## Normalization Pipeline

After provider response:

1. Ensure required fields exist
2. Clamp confidence to `0..1`
3. Generate stable IDs
4. Separate observations from inferences
5. Deduplicate repeated text
6. Redact secrets if enabled
7. Downgrade unsupported claims to uncertainty
8. Validate final JSON with zod

## Evidence Graph (MVP)

No database. Return optional in-memory graph in tool output:

```json
{
  "graph": {
    "nodes": [{ "id": "img_001", "type": "Image", "label": "error.png" }],
    "edges": [{ "from": "img_001", "to": "txt_001", "type": "CONTAINS" }]
  }
}
```

Node types: `Image`, `Region`, `TextBlock`, `UIComponent`, `DiagramNode`, `ErrorMessage`, `CodeReference`, `Inference`, `Recommendation`, etc.

Future storage: JSONL, SQLite, graph DB — **not MVP**.

## Ask Atlas (Future)

Query layer over evidence history — **not MVP**. Output schema must remain compatible for future addition.

## Source

Derived from `SPEC.md` §7, §8, §9, Appendix C.
