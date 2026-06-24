# Harness Maturity Ladder

This ladder defines how the Atlas Vision MCP repository progresses from static
agent instructions to measurable harness improvement.

The levels are intentionally verifiable. A level is achieved only when its
criteria can be inspected in repository files, durable Harness records, or
benchmark output.

## Levels

### H0 - Bare Environment

The model operates with no repository harness. It receives a prompt and may
produce a patch, but the repo does not tell it how to classify, validate, or
record work.

Criteria:

- No `AGENTS.md` Harness block exists.
- No feature intake policy exists.
- No story, decision, validation, or trace artifact exists.

Required files:

- None.

Current status:

- Passed. This repository is beyond H0.

### H1 - Scaffolding And Policy

The repository contains static operating instructions, templates, risk lanes,
and source-of-truth rules. Agents can follow a documented workflow, but durable
state may still be manual or incomplete.

Criteria:

- `AGENTS.md` points agents to the Harness operating docs.
- `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, and `docs/ARCHITECTURE.md` exist.
- Story, decision, and validation templates exist under `docs/templates/`.
- `docs/TEST_MATRIX.md` defines proof columns and status meanings.

Required files:

- `AGENTS.md`
- `docs/HARNESS.md`
- `docs/FEATURE_INTAKE.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_MATRIX.md`
- `docs/templates/story.md`
- `docs/templates/decision.md`
- `docs/templates/validation-report.md`

Current status:

- Achieved. All H1 files exist.

### H2 - Durable State And Observability

The repository has structured operational records and explicit observation
rules. Agents can record what happened, connect work to stories, and write
traces with predictable depth.

Criteria:

- `scripts/bin/harness-cli` can record intake, story, decision, backlog, and
  trace data in `harness.db`.
- `scripts/schema/001-init.sql` defines durable tables.
- `docs/HARNESS_COMPONENTS.md` maps files and responsibilities.
- `docs/HARNESS_MATURITY.md` defines H0-H5 with measurable criteria.
- `docs/TRACE_SPEC.md` defines trace fields, quality tiers, and friction capture.
- `docs/CONTEXT_RULES.md` defines phase-by-lane context rules.
- `AGENTS.md` and `docs/HARNESS.md` reference the operating docs.

Required files:

- `scripts/bin/harness-cli`
- `scripts/schema/001-init.sql`
- `docs/HARNESS_COMPONENTS.md`
- `docs/HARNESS_MATURITY.md`
- `docs/TRACE_SPEC.md`
- `docs/CONTEXT_RULES.md`

Operational evidence:

- 12 stories registered in DB, all verified pass.
- 14 decisions registered in DB.
- 3 traces recorded.
- 5 tools registered and present (pnpm, vitest, biome, tsc, tsup).
- `audit` entropy score: 0/100.

Current status:

- Achieved. Durable state exists, stories and decisions are populated, tools
  are registered, and audit entropy is 0.

### H3 - Active Observability And Evolution

The harness can evaluate its own operational data and turn repeated failures
into prioritized improvements.

Criteria:

- Trace quality can be scored by a repeatable command.
- Harness friction can be grouped by component from `docs/HARNESS_COMPONENTS.md`.
- Backlog items include predicted impact and actual outcome after completion.
- A friction-to-backlog review loop is documented.

Required files:

- H2 files.
- A documented trace quality scoring method.

Current status:

- Partial. `scripts/bin/harness-cli score-trace` scores trace quality,
  `query friction` retrieves friction records, and backlog outcome loop exists.
  Full H3 requires accumulated friction data and demonstrated backlog-to-outcome
  comparisons over multiple traces.

### H4 - Automated Verification

The harness can run or orchestrate proof checks consistently and can reject or
flag incomplete work before the final response.

Criteria:

- Stories can store and execute a `verify_command`.
- Trace recording warns when a linked story has a verification command that has
  not passed.
- Missing validation evidence is surfaced before a task is marked implemented.

Required files:

- H3 files.
- Story verification command documentation.

Operational evidence:

- `scripts/bin/harness-cli story verify <id>` runs proof commands.
- `scripts/bin/harness-cli story verify-all` runs all configured proof commands.
- `trace --story` warns when linked story verification has not passed.

Current status:

- Achieved. All 12 stories have `pnpm test` as verify_command and pass.
  `story verify-all` runs the full suite per story.

### H5 - Self-Improving Harness

The harness can use traces, benchmark results, and backlog outcomes to propose
or apply safe improvements to itself.

Criteria:

- Repeated friction patterns are summarized into proposed harness changes.
- Proposed changes include predicted impact, risk, validation plan, and
  rollback criteria.
- Completed changes compare predicted impact with actual trace outcomes.
- High-risk harness changes pause for human confirmation.

Required files:

- H4 files.
- `docs/IMPROVEMENT_PROTOCOL.md`

Current status:

- Partial. `scripts/bin/harness-cli audit` detects drift,
  `scripts/bin/harness-cli propose` generates proposals,
  `docs/IMPROVEMENT_PROTOCOL.md` defines the review loop.
  Full H5 requires accumulated proposal-to-outcome evidence.

## Current Assessment

| Level | Status | Evidence |
| --- | --- | --- |
| H0 | Passed | Harness docs, templates, and durable records exist. |
| H1 | Achieved | `AGENTS.md`, `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, `docs/ARCHITECTURE.md`, `docs/templates/*`, `docs/TEST_MATRIX.md` exist. |
| H2 | Achieved | CLI + schema + component/maturity/trace/context docs + 12 stories + 14 decisions + 5 registered tools + 0 entropy. |
| H3 | Partial | `score-trace`, `query friction`, backlog outcome loop exist but lack accumulated data. |
| H4 | Achieved | `story verify` + `story verify-all` + trace-time verification warning. All 12 stories verified pass. |
| H5 | Partial | `audit`, `propose`, `docs/IMPROVEMENT_PROTOCOL.md` exist. Needs accumulated proposal-to-outcome data. |

## Responsibility Activation

| Responsibility | H0 | H1 | H2 | H3 | H4 | H5 |
| --- | --- | --- | --- | --- | --- | --- |
| Task specification | Missing | Covered | Covered | Covered | Covered | Covered |
| Context selection | Missing | Partial | Covered | Covered | Covered | Covered |
| Tool access | Missing | Partial | Covered | Covered | Covered | Covered |
| Project memory | Missing | Covered | Covered | Covered | Covered | Covered |
| Task state | Missing | Partial | Covered | Covered | Covered | Covered |
| Observability | Missing | Missing | Partial | Covered | Covered | Covered |
| Failure attribution | Missing | Missing | Partial | Covered | Covered | Covered |
| Verification | Missing | Partial | Partial | Partial | Covered | Covered |
| Permissions | Missing | Partial | Partial | Partial | Covered | Covered |
| Entropy auditing | Missing | Missing | Partial | Covered | Covered | Covered |
| Intervention recording | Missing | Partial | Partial | Covered | Covered | Covered |
