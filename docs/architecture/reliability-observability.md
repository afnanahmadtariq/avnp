# Reliability and observability

Status: Planned baseline  
Owner: Engineering  
Last reviewed: 2026-07-19

## Reliability model

- HTTP creates or reads state; it does not own long-running calls.
- Queue jobs use stable idempotency keys and bounded retry policies.
- Provider webhooks can arrive late, duplicated, or out of order; transitions validate monotonic state and provider timestamps.
- A partially completed run remains useful: completed quotes are compared while failed, declined, and callback states stay visible.
- Provider-specific failure does not erase previously persisted transcript, quote, or attempt state.
- Manual retry creates a new attempt under the same logical target rather than mutating history.

## Correlation

Every log and event should carry safe identifiers for request, user/account, job, specification version, run, business, call attempt, queue job, and provider event where applicable. Raw phone numbers, addresses, transcripts, documents, and secrets do not belong in normal structured logs.

## Initial service indicators

- Time from user confirmation to first call queued.
- Call connection and structured-outcome rates.
- Quote completeness and transcript-evaluation scores.
- Provider webhook verification and duplicate-event rates.
- Retry, timeout, callback, decline, and terminal failure counts.
- Time from final call outcome to comparison and report readiness.
- User-visible progress freshness, targeting under five seconds.

## Health checks

Liveness reports that a process can serve or poll. Readiness separately checks required dependencies for the enabled mode. Development and test modes may be ready with mock adapters; production readiness must fail when required database, queue, or provider configuration is unavailable.

## Retry guidance

Retry only errors classified as transient, use exponential backoff with jitter, cap attempts, and surface exhausted work for review. Do not retry a billable call blindly when the provider may have accepted the first request; resolve by idempotency key or provider lookup first.
