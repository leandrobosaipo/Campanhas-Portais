# Task 2 — targeted Drive PI recovery

## Implemented contract

- `drive-pi-publish` accepts additive `recoveryTarget` with PI, portal, format, period and optional canonical insertion.
- Both public and private API paths validate and preserve the target; recovery requires strict insertion scope and prohibits PDF-derived scope expansion.
- The runner obtains a fresh monthly source, requires exactly one confirmed safe row matching the target, and requires PDF PI/scope agreement before mutation.
- A supplied insertion is updated in place only after campaign/site/format/period verification. Without it, the existing dedupe flow remains responsible for a unique missing insertion.
- Recovery prevents generic sheet sync and strict-scope sibling cancellation. Media recovery requires Drive MD5 agreement and validates binary type and dimensions against the position profile.
- Historical periods fail closed with `reconstruction_provenance_required`; this task deliberately does not invoke legacy `print-backfill`, because it cannot attest an actual capture time.

## Validation

- `pnpm --dir scripts exec tsc -p tsconfig.json --noEmit`
- `node scripts/src/test-drive-pi-recovery-target.mjs`
- `pnpm --dir scripts run test:drive-pi-publish-flow`
- `pnpm --dir scripts run test:drive-pi-event-flow`

## Remaining gate

Historical evidence needs a provenance-aware capture path before it can be reconstructed or promoted. PNMT selector failures remain outside this scoped change.
