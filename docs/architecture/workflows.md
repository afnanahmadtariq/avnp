# Core workflows

Status: Canonical foundation  
Owner: Engineering and product  
Last reviewed: 2026-07-19

## Intake to confirmed specification

```mermaid
sequenceDiagram
  actor User
  participant Web
  participant API
  participant Intake as Voice / document adapters
  participant DB

  User->>Web: Start moving request
  Web->>API: Create draft job
  User->>Intake: Interview and/or upload
  Intake-->>API: Extracted facts + source confidence
  API->>DB: Merge into draft specification
  API-->>Web: Validated draft
  User->>Web: Edit and confirm
  Web->>API: Confirm exact version
  API->>DB: Freeze specification version
  API-->>Web: Confirmation + version ID
```

A confirmed specification is immutable. Corrections create a new version. Quotes gathered for different material versions are not treated as directly comparable.

## Call and negotiation run

```mermaid
sequenceDiagram
  participant API
  participant Queue
  participant Worker
  participant Provider as Voice / phone provider
  participant Domain
  participant DB

  API->>Queue: Enqueue run(specVersionId)
  Queue->>Worker: Deliver idempotent job
  par Counterparty A
    Worker->>Provider: Start call with confirmed spec
  and Counterparty B
    Worker->>Provider: Start call with confirmed spec
  and Counterparty C
    Worker->>Provider: Start call with confirmed spec
  end
  Provider-->>Worker: Events, transcript, recording reference
  Worker->>DB: Persist structured outcomes
  Worker->>Domain: Normalize, flag, and rank quotes
  Domain-->>Worker: Scores and recommendation factors
  Worker->>DB: Persist report and evidence links
```

## State models

Job specification:

```text
draft -> ready_for_review -> confirmed -> superseded
```

Negotiation run:

```text
draft -> queued -> discovering -> calling -> comparing -> completed
                                       \-> partially_completed
                                       \-> failed
```

Call attempt:

```text
queued -> dialing -> in_progress -> negotiating -> completed
       \-> failed / cancelled
```

The outcome contract separately supports `quote_received`, `callback_requested`, `declined`, `unavailable`, `no_answer`, `busy`, and `failed`. Provider outcomes and transcript fallbacks are classified into those explicit states before ranking. Transitions record an occurred-at timestamp, actor or provider, correlation ID, and reason where available.

After all initial calls finish, ranking may schedule one follow-up round per eligible negotiation. A follow-up can reference only a lower, same-currency, transcript-backed quote from another business in the same run; the run remains non-terminal until those deterministic follow-ups finish.

## Idempotency

Queue jobs and provider webhooks use stable keys derived from the run, target business, attempt number, and provider event ID. A retry may repeat safe reads and provider lookups but cannot create a second logical call, quote, or negotiation record for the same idempotency key.
