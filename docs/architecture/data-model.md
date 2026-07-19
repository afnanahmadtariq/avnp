# Conceptual data model

Status: Canonical concept; Prisma schema is implementation source  
Owner: Engineering  
Last reviewed: 2026-07-19

## Core records

### Job

Represents the customer's purchasing request and current lifecycle. `publicId` is the customer-facing reference, `title` is the editable label, and `specification` is the current draft. The job owns immutable confirmed specification versions and negotiation runs.

Key fields: identifier, owner identifier, vertical key, status, created/updated timestamps.

### Job specification version

Contains the exact confirmed facts reused across calls: pickup, destination, rooms, inventory, access constraints, moving date, budget, notes, source metadata, and confirmation timestamp. A content digest supports comparison and audit.

### Business

Represents a discovered counterparty with normalized phone number, location, rating, review count, discovery provider, and provider identifier.

### Negotiation run

Groups the set of comparable calls and final report for one confirmed specification version. It carries run status, correlation and configuration versions, calling/recording consent timestamps, pause state, failure state, and lifecycle timestamps.

### Run event

Provides an ordered, append-only progress stream for a negotiation run. Each event carries a per-run sequence, safe correlation identifier, actor, type, timestamp, and structured payload suitable for polling or server-sent events.

### Call attempt

Represents one provider session with one business. It stores attempt status, provider references, timing, structured terminal outcome, disclosure state, consent state, and error details safe for internal diagnosis.

### Quote

Stores currency, itemized fees, discounts, total, binding/estimate classification, completeness, confidence, expiry, assumptions, risk flags, and evidence references. Missing values remain missing rather than becoming zero.

### Negotiation

Records the truthful strategy used, compatible leverage quote, price or terms before and after, saved amount, transcript evidence, and policy evaluation.

### Evidence

References transcripts, recordings, uploaded documents, extracted spans, and provider metadata stored outside large relational rows when appropriate. It carries access class, retention deadline, and integrity metadata.

### Recommendation

Stores ranked quote identifiers, scoring factors, explanation, best-value selection, savings metrics, and the policy/configuration versions used to produce it.

### Decision

Stores the customer's durable response to a recommendation: selected quote, deferred choice, or decision to decline all quotes. A run has at most one current decision.

### Outbox event

Stores a durable event in the same PostgreSQL transaction as the state change that produced it. Dispatchers publish pending rows idempotently so a database commit cannot be silently separated from queue delivery.

## Relationships

```mermaid
erDiagram
  JOB ||--o{ JOB_SPEC_VERSION : has
  JOB_SPEC_VERSION ||--o{ NEGOTIATION_RUN : drives
  NEGOTIATION_RUN ||--o{ CALL_ATTEMPT : contains
  NEGOTIATION_RUN ||--o{ RUN_EVENT : emits
  BUSINESS ||--o{ CALL_ATTEMPT : receives
  CALL_ATTEMPT ||--o| QUOTE : produces
  CALL_ATTEMPT ||--o{ EVIDENCE : creates
  QUOTE ||--o{ NEGOTIATION : changes
  NEGOTIATION_RUN ||--o| RECOMMENDATION : produces
  RECOMMENDATION }o--o{ QUOTE : ranks
  NEGOTIATION_RUN ||--o| DECISION : records
```

## Money and confidence

Money is stored as integer minor units plus ISO currency. Confidence is an explicit bounded score with reason/source metadata, not a label inferred from whether a value exists. Quote totals should be reproducible from itemization or carry a visible reconciliation difference.

## Retention

Core job and quote records may outlive raw voice evidence. Recordings, transcripts, documents, and extracted personal information need separate retention and access policies so evidence can expire without corrupting the comparison history.

## Local schema lifecycle

The current project intentionally uses Prisma schema push rather than a migrations directory. `db:push` synchronizes a development database, `db:seed` idempotently upserts the labeled `RLY-2048` fixture, and `db:reset` performs an explicit destructive local reset followed by that seed. The PostgreSQL 18 image and named volume remain unchanged; reset is opt-in and must never be aimed at a shared or production database.
