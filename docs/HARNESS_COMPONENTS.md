# Harness Components

This taxonomy maps the Atlas Vision MCP repository to two component frameworks:

- Runtime Substrate responsibilities: the 11 responsibility areas the harness
  should cover.
- NexAU decomposition: the seven implementation surfaces that influence agent
  behavior.

Status values:

- **Covered**: the repository has an explicit file, command, or record for this
  responsibility.
- **Partial**: the repository has some support, but the support is incomplete,
  manual, or not yet measured.
- **Missing**: no meaningful support exists yet.

## Responsibility Map

| # | Responsibility | Status | Harness Files | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| 1 | Task specification | Covered | `AGENTS.md`, `docs/FEATURE_INTAKE.md`, `docs/templates/story.md`, `docs/templates/spec-intake.md`, `docs/templates/high-risk-story/*`, `docs/stories/*`, `intake` table, `story` table | Requests are classified by type and lane before implementation; normal and high-risk work have templates and durable story rows. | Keep story packets synchronized with future product docs. |
| 2 | Context selection | Covered | `AGENTS.md`, `docs/CONTEXT_RULES.md`, `docs/ARCHITECTURE.md`, `docs/decisions/*`, `docs/product/README.md`, `scripts/bin/harness-cli score-context` | Phase-by-lane context rules and retrieval triggers exist; context scoring available against recorded trace reads. | Future automation could enforce context selection instead of only measuring it. |
| 3 | Tool access | Covered | `scripts/bin/harness-cli`, `docs/TOOL_REGISTRY.md`, `tool` table, `scripts/schema/*` | The Harness CLI exposes operational commands and a machine-readable tool manifest through `query tools`; project tools (pnpm, vitest, biome, tsc, tsup) are registered and present. | Permission profiles and usage analytics remain future work. |
| 4 | Project memory | Covered | `docs/HARNESS.md`, `docs/decisions/*`, `docs/GLOSSARY.md`, `docs/HARNESS_BACKLOG.md`, `docs/stories/*`, `harness.db`, `decision`, `backlog`, and `trace` tables | Decisions, backlog, stories, and traces preserve durable knowledge across tasks. | Future work should add staleness checks and summarize old traces. |
| 5 | Task state | Covered | `scripts/bin/harness-cli query matrix`, `docs/TEST_MATRIX.md`, `intake` table, `story` table, `trace` table | Durable records track intake, story status, proof columns, and task traces. | Add lifecycle checks so in-progress stories cannot be forgotten. |
| 6 | Observability | Partial | `docs/TRACE_SPEC.md`, `trace` table, `scripts/bin/harness-cli trace`, `scripts/bin/harness-cli score-trace`, `scripts/bin/harness-cli query traces`, `scripts/bin/harness-cli query friction`, `docs/HARNESS_MATURITY.md` | Traces are auto-scored when recorded, can be rescored by command, and can be reviewed with friction context. | No dashboard or benchmark ingestion exists in this repo. |
| 7 | Failure attribution | Partial | `docs/HARNESS_COMPONENTS.md`, `docs/TRACE_SPEC.md`, `trace.errors`, `trace.harness_friction`, `docs/HARNESS_BACKLOG.md`, `backlog` table, `scripts/bin/harness-cli query friction` | Failures can be tied to files, components, friction, backlog proposals, and linked intake lane/type context. | No automated attribution from benchmark failures to harness components exists yet. |
| 8 | Verification | Covered | `docs/TEST_MATRIX.md`, `scripts/bin/harness-cli query matrix`, `scripts/bin/harness-cli story verify`, `scripts/bin/harness-cli story verify-all`, `scripts/bin/harness-cli trace`, `scripts/bin/harness-cli score-trace`, `story.verify_command`, `story.last_verified_result`, `docs/templates/validation-report.md` | Stories can store and run mechanical proof commands individually or in batch, traces warn when linked story verification has not passed, trace quality can be checked mechanically. | Benchmark ingestion remains future work. |
| 9 | Permissions | Partial | `AGENTS.md`, `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, `docs/ARCHITECTURE.md` | Policy describes when agents may update docs and when to ask before architecture or workflow changes. | Permissions are instruction-level only; no enforced policy layer or command allowlist exists. |
| 10 | Entropy auditing | Covered | `docs/HARNESS_BACKLOG.md`, `docs/HARNESS_AUDIT.md`, `docs/IMPROVEMENT_PROTOCOL.md`, `backlog` table, `trace.harness_friction`, `scripts/bin/harness-cli audit`, `scripts/bin/harness-cli propose`, `docs/HARNESS_MATURITY.md` | Growth rule captures friction, audit detects drift and entropy score, backlog items compare predicted impact to actual outcome, and proposal generation can create reviewable backlog items. | Automated repair remains future work. |
| 11 | Intervention recording | Covered | `intervention` table, `scripts/bin/harness-cli intervention add`, `scripts/bin/harness-cli query interventions`, `trace` table, `docs/decisions/*`, `docs/stories/*`, `docs/HARNESS.md` | Human, reviewer, CI, and agent interventions are separate durable records and can be filtered by trace, story, or type. | Capture is still manual and advisory. |

## NexAU Cross-Reference

| Component | Harness Equivalent | Status | Notes |
| --- | --- | --- | --- |
| System prompts | `AGENTS.md` plus Harness policy docs | Covered | `AGENTS.md` is the stable shim; `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, and `docs/CONTEXT_RULES.md` carry evolving operating instructions. |
| Tool descriptions | `docs/TOOL_REGISTRY.md`, `scripts/README.md`, `docs/HARNESS.md`, `docs/TRACE_SPEC.md`, `scripts/bin/harness-cli query tools` | Covered | Commands are documented in a standalone registry and exposed as compiled plus registered tool manifest entries. |
| Tool implementations | `scripts/bin/harness-cli`, `scripts/schema/*` | Covered | The Rust CLI is the primary durable-layer implementation and stable repo-local entrypoint. |
| Middleware | feature intake workflow | Partial | The intake process mediates work, but there is no runtime middleware enforcing policies. |
| Skills | `docs/templates/*`, `docs/FEATURE_INTAKE.md`, `docs/CONTEXT_RULES.md`, `docs/TRACE_SPEC.md` | Partial | Reusable procedures exist as markdown, not executable or installable agent skills. |
| Sub-agents | None in this repository | Missing | No delegated specialist agents or sub-agent protocols exist. |
| Long-term memory | `harness.db`, `docs/decisions/*`, `docs/stories/*`, `docs/HARNESS_BACKLOG.md`, `docs/GLOSSARY.md` | Covered | Durable records and markdown decisions preserve task history and project vocabulary. |

## File Inventory

Every tracked project file is mapped to at least one Runtime Substrate responsibility.

| File | Primary Responsibility | Secondary Responsibilities |
| --- | --- | --- |
| `.gitignore` | Tool access | Task state |
| `AGENTS.md` | Context selection | Task specification, permissions |
| `README.md` | Task specification | Project memory |
| `package.json` | Tool access | Verification |
| `pnpm-lock.yaml` | Tool access | Verification |
| `tsconfig.json` | Tool access | Verification |
| `tsup.config.ts` | Tool access | Verification |
| `vitest.config.ts` | Tool access | Verification |
| `biome.json` | Tool access | Verification |
| `SPEC.md` | Task specification | Project memory |
| `src/index.ts` | Task specification | Project memory |
| `src/config.ts` | Tool access | Task state |
| `src/constants.ts` | Project memory | Task specification |
| `src/server.ts` | Tool access | Verification |
| `src/cli/main.ts` | Tool access | Task specification |
| `src/cli/commands.ts` | Tool access | Verification |
| `src/cli/parse-args.ts` | Tool access | Task state |
| `src/cli/run.ts` | Tool access | Verification |
| `src/extraction/index.ts` | Project memory | Task specification |
| `src/extraction/schemas.ts` | Verification | Task specification |
| `src/extraction/normalize.ts` | Verification | Task specification |
| `src/image/index.ts` | Project memory | Task specification |
| `src/image/errors.ts` | Failure attribution | Task specification |
| `src/image/limits.ts` | Verification | Task specification |
| `src/image/mime.ts` | Verification | Task specification |
| `src/image/preprocess.ts` | Verification | Task specification |
| `src/image/read-image.ts` | Verification | Task specification |
| `src/providers/index.ts` | Project memory | Task specification |
| `src/providers/types.ts` | Project memory | Task specification |
| `src/providers/router.ts` | Tool access | Verification |
| `src/providers/errors.ts` | Failure attribution | Task specification |
| `src/providers/prompts.ts` | Task specification | Project memory |
| `src/providers/openai-compatible.ts` | Verification | Task specification |
| `src/security/index.ts` | Project memory | Task specification |
| `src/security/path-policy.ts` | Verification | Permissions |
| `src/security/redact.ts` | Verification | Permissions |
| `src/security/prompt-injection.ts` | Verification | Permissions |
| `src/security/sanitize-output.ts` | Verification | Permissions |
| `src/tools/index.ts` | Project memory | Task specification |
| `src/tools/analyze-image.ts` | Verification | Task specification |
| `src/tools/ocr-image.ts` | Verification | Task specification |
| `src/tools/analyze-ui-screenshot.ts` | Verification | Task specification |
| `src/tools/compare-images.ts` | Verification | Task specification |
| `docs/ARCHITECTURE.md` | Permissions | Context selection, task specification |
| `docs/FEATURE_INTAKE.md` | Task specification | Permissions, context selection |
| `docs/GLOSSARY.md` | Project memory | Context selection |
| `docs/HARNESS.md` | Task specification | Project memory, task state, permissions |
| `docs/HARNESS_BACKLOG.md` | Entropy auditing | Project memory, failure attribution |
| `docs/HARNESS_COMPONENTS.md` | Failure attribution | Observability, entropy auditing |
| `docs/HARNESS_MATURITY.md` | Entropy auditing | Observability, verification |
| `docs/HARNESS_AUDIT.md` | Entropy auditing | Verification, task state |
| `docs/IMPROVEMENT_PROTOCOL.md` | Entropy auditing | Failure attribution, permissions |
| `docs/CONTEXT_RULES.md` | Context selection | Permissions, task specification |
| `docs/TRACE_SPEC.md` | Observability | Failure attribution, intervention recording |
| `docs/TOOL_REGISTRY.md` | Tool access | Context selection, verification |
| `docs/TEST_MATRIX.md` | Verification | Task state |
| `docs/PUBLISH.md` | Task specification | Verification |
| `docs/README.md` | Project memory | Context selection |
| `docs/product/README.md` | Task specification | Project memory |
| `docs/product/overview.md` | Task specification | Project memory |
| `docs/product/mcp-tools.md` | Task specification | Verification |
| `docs/product/provider.md` | Task specification | Verification |
| `docs/product/security.md` | Task specification | Permissions |
| `docs/product/cli.md` | Task specification | Tool access |
| `docs/product/integration.md` | Task specification | Project memory |
| `docs/product/extraction-and-evidence.md` | Task specification | Verification |
| `docs/product/roadmap.md` | Task specification | Project memory |
| `docs/stories/README.md` | Task specification | Project memory |
| `docs/stories/backlog.md` | Task specification | Project memory |
| `docs/stories/US-001-package-skeleton.md` | Task specification | Verification |
| `docs/stories/US-002-config-env-loader.md` | Task specification | Verification |
| `docs/stories/US-003-openai-compatible-provider.md` | Task specification | Verification |
| `docs/stories/US-004-image-read-validation.md` | Task specification | Verification |
| `docs/stories/US-005-analyze-image-tool.md` | Task specification | Verification |
| `docs/stories/US-006-cli-analyze-doctor.md` | Task specification | Verification |
| `docs/stories/US-007-mcp-stdio-server.md` | Task specification | Verification |
| `docs/stories/US-008-ocr-image-tool.md` | Task specification | Verification |
| `docs/stories/US-009-analyze-ui-screenshot-tool.md` | Task specification | Verification |
| `docs/stories/US-010-compare-images-tool.md` | Task specification | Verification |
| `docs/stories/US-011-safety-path-redaction.md` | Task specification | Permissions |
| `docs/stories/US-012-integration-docs-publish.md` | Task specification | Verification |
| `docs/decisions/README.md` | Project memory | Context selection |
| `docs/decisions/0001-harness-first-development.md` | Project memory | Permissions |
| `docs/decisions/0001-typescript-stack.md` | Project memory | Task specification |
| `docs/decisions/0002-mcp-stdio-local-first.md` | Project memory | Task specification |
| `docs/decisions/0002-post-spec-product-lifecycle.md` | Project memory | Task specification |
| `docs/decisions/0003-generic-spec-intake-harness.md` | Project memory | Task specification |
| `docs/decisions/0003-openai-compatible-provider-first.md` | Project memory | Task specification |
| `docs/decisions/0004-sqlite-durable-layer.md` | Project memory | Observability, task state |
| `docs/decisions/0004-text-json-evidence-output.md` | Project memory | Verification |
| `docs/decisions/0005-four-tool-surface.md` | Project memory | Task specification |
| `docs/decisions/0005-prebuilt-rust-harness-cli.md` | Project memory | Tool access |
| `docs/decisions/0006-no-persistence-by-default.md` | Project memory | Permissions |
| `docs/decisions/0006-phase-4-benchmark-triage.md` | Project memory | Verification |
| `docs/decisions/0007-improvement-proposal-rules.md` | Project memory | Entropy auditing, permissions |
| `docs/decisions/0007-verified-inferred-discussed-separation.md` | Project memory | Verification |
| `docs/templates/decision.md` | Project memory | Task specification |
| `docs/templates/spec-intake.md` | Task specification | Context selection |
| `docs/templates/story.md` | Task specification | Verification |
| `docs/templates/validation-report.md` | Verification | Intervention recording |
| `docs/templates/high-risk-story/overview.md` | Task specification | Context selection |
| `docs/templates/high-risk-story/design.md` | Task specification | Permissions |
| `docs/templates/high-risk-story/execplan.md` | Task state | Verification |
| `docs/templates/high-risk-story/validation.md` | Verification | Failure attribution |
| `scripts/README.md` | Tool access | Context selection |
| `scripts/bin/harness-cli.exe` (Windows) or `scripts/bin/harness-cli` (macOS/Linux) | Tool access | Task state, observability |
| `scripts/schema/001-init.sql` | Task state | Observability, project memory |
| `scripts/schema/002-story-verify.sql` | Verification | Task state, project memory |
| `scripts/schema/003-tool-registry.sql` | Tool access | Project memory |
| `scripts/schema/004-intervention.sql` | Intervention recording | Failure attribution |
| `scripts/schema/005-tool-extensions.sql` | Tool access | Project memory |
| `examples/README.md` | Task specification | Project memory |
| `examples/agent-prompts.md` | Task specification | Context selection |
| `examples/claude-code.sh` | Task specification | Tool access |
| `examples/droid.sh` | Task specification | Tool access |
| `examples/opencode.jsonc` | Task specification | Tool access |
| `tests/config.test.ts` | Verification | Task specification |
| `tests/skeleton.test.ts` | Verification | Task specification |
| `tests/path-policy.test.ts` | Verification | Permissions |
| `tests/cli/commands.test.ts` | Verification | Tool access |
| `tests/extraction/normalize.test.ts` | Verification | Task specification |
| `tests/image/read-image.test.ts` | Verification | Task specification |
| `tests/providers/openai-compatible.test.ts` | Verification | Task specification |
| `tests/security/redact.test.ts` | Verification | Permissions |
| `tests/security/prompt-injection.test.ts` | Verification | Permissions |
| `tests/security/integration.test.ts` | Verification | Permissions |
| `tests/server/mcp-server.test.ts` | Verification | Tool access |
| `tests/tools/analyze-image.test.ts` | Verification | Task specification |
| `tests/tools/ocr-image.test.ts` | Verification | Task specification |
| `tests/tools/analyze-ui-screenshot.test.ts` | Verification | Task specification |
| `tests/tools/compare-images.test.ts` | Verification | Task specification |
| `tests/integration/publish-smoke.test.ts` | Verification | Tool access |

## Coverage Summary

- Covered: 8/11 responsibilities.
- Partial: 3/11 responsibilities.
- Missing: 0/11 responsibilities.

Covered responsibilities:

- Task specification.
- Context selection.
- Tool access.
- Project memory.
- Task state.
- Verification.
- Entropy auditing.
- Intervention recording.
Partial responsibilities:

- Observability.
- Failure attribution.
- Permissions.

Later phases should focus on dashboard ingestion, component-level attribution,
permission enforcement, and tool usage analytics.
