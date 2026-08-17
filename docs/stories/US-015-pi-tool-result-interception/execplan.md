# Exec Plan

## Goal

Allow text-only Pi models to receive Atlas evidence for images emitted by tools
without duplicate calls, arbitrary path discovery, path-policy bypasses,
temporary-file leaks, or parallel execution races.

## Scope

In scope:

- Pi `tool_result` extension wiring.
- Reusable harness API and public exports.
- Canonical image-block handling and constrained `read` fallback.
- Abort propagation, temporary cleanup, concurrency-safe naming, tests, docs,
  and Harness records.

Out of scope:

- MCP protocol changes.
- Automatic handling for clients that do not expose tool-result image blocks.
- Broader provider cancellation refactors outside the intercept dependency seam.

## Risk Classification

Risk flags:

- Audit/security: images may contain secrets and are sent to an external provider.
- External systems: the flow invokes the configured vision provider.
- Public contracts: a new exported harness API is introduced.
- Existing behavior: Pi interception and path-policy semantics are extended.
- Cross-platform: temp paths and cleanup must work on Windows, macOS, and Linux.

Hard gates:

- Security boundary and external-provider behavior.

## Work Phases

1. Verify current and latest official Pi tool-result/read contracts.
2. Record the upload/path boundary decision.
3. Define regression and failure-mode tests.
4. Implement source selection, cleanup, cancellation, and extension wiring.
5. Run targeted, full, platform, and diff verification.
6. Update durable story/decision evidence and task trace.

## Stop Conditions

Pause for human confirmation if:

- Product behavior requires uploading arbitrary paths outside configured roots.
- Validation would need to weaken path-policy or privacy requirements.
- The Pi event contract differs materially from the official supported versions.
