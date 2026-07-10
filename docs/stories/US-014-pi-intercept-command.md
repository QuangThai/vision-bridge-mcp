# US-014 Pi Intercept Command Override

## Status

implemented

## Lane

normal

## Product Contract

The Pi extension exposes `/atlas [on|off|auto|status]` so a user can override
Atlas image interception during the current Pi session. `off` bypasses Atlas;
`on` forces it; `auto` restores Pi's native-vision capability decision. The
command does not change environment-file defaults.

## Relevant Product Docs

- `docs/product/pi-integration.md`

## Acceptance Criteria

- `/atlas off` prevents the Pi `before_agent_start` hook from intercepting images.
- `/atlas on` forces interception even when Pi reports model image support.
- `/atlas auto` restores capability-based routing, and `/atlas status` reports the mode.
- `ATLAS_SKIP_INTERCEPT` and `ATLAS_FORCE_INTERCEPT` remain the defaults after Pi restarts.

## Design Notes

- Commands: `/atlas [on|off|auto|status]`; `enable`/`disable` are aliases.
- State: in-memory per extension session; no config or environment file writes.
- UI surface: Pi status line and notifications.

## Validation

| Layer | Expected proof |
| --- | --- |
| Unit | Command registration changes the session mode and `off` bypasses the hook. |
| Integration | Existing capability tests keep native-vision auto-skip coverage. |
| E2E | Not required; Pi UI command handling is exercised through the extension API unit seam. |
| Platform | Typecheck, lint, build, and full test suite pass. |
| Release | N/A |

## Harness Delta

None.

## Evidence

- `pnpm vitest run tests/capabilities/pi-extension-command.test.ts`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
