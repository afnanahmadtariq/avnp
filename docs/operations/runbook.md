# Operational runbook

Status: Planned baseline  
Owner: Engineering  
Last reviewed: 2026-07-19

## API unhealthy

Check process liveness, configuration parsing, database readiness for enabled routes, and recent deployment changes. Do not route provider webhooks to a replacement environment unless it has the matching signature secret and idempotency state.

## Worker not processing

Check Redis connectivity, queue pause state, worker readiness, concurrency, and stalled jobs. Restarting must not create duplicate calls; inspect the job idempotency key and provider-side session before retrying billable work.

## Provider webhooks failing

Confirm signature verification, public URL, clock skew, raw-body handling, and provider retry behavior. Preserve failed events securely for bounded replay. Never disable verification as a production workaround.

## Voice or telephony outage

Pause new live calls, keep existing run state visible, and switch demonstrations to labeled deterministic counterparties if appropriate. Resume only after confirming that timed-out requests did not create active provider sessions.

## Quote extraction degraded

Keep transcripts/evidence, mark affected quotes for review, and avoid confident recommendations. Re-run extraction against the same immutable evidence and record the new model/configuration version.

## Suspected secret exposure

Disable or rotate the credential immediately, inspect access and call logs, remove the value from active deployments, and follow the [security and privacy controls](../architecture/security-privacy.md). Deleting it from the latest file does not remove it from Git history.

## Data or consent incident

Stop affected processing, preserve safe audit metadata, restrict evidence access, and involve the project owner/legal reviewer. Do not continue recording or calling while consent state is uncertain.
