# Product requirements

Status: Canonical  
Owner: Product and engineering  
Last reviewed: 2026-07-19

Requirement identifiers are stable and should be referenced by code, tests, task-list evidence, and demo notes.

## Intake

- **FR-INT-001:** The user can complete a voice interview built on ElevenLabs Agents.
- **FR-INT-002:** The user can submit at least one supported document or image type for extraction.
- **FR-INT-003:** Voice and document inputs converge into the same structured job specification.
- **FR-INT-004:** The specification captures pickup, destination, rooms, inventory, access constraints, moving date, budget, and notes where supplied.
- **FR-INT-005:** The user can review, edit, and explicitly confirm the specification before any outbound call.
- **FR-INT-006:** The confirmed specification is versioned and reused consistently across every call.

## Business discovery

- **FR-DIS-001:** The system can discover moving businesses by location and radius through Google Places API (New).
- **FR-DIS-002:** Each candidate includes a name, phone number, location, rating, review count, and discovery source when available.
- **FR-DIS-003:** The user or system can filter businesses that cannot serve the job or lack a callable number.
- **FR-DIS-004:** Credential-free development uses deterministic candidate fixtures through the same contract.

## Voice calling and conversation

- **FR-CALL-001:** The system can run at least three calls concurrently or as parallel provider sessions.
- **FR-CALL-002:** The agent describes the confirmed job consistently while handling interruptions, vague answers, refusals, callbacks, and hard selling.
- **FR-CALL-003:** Sara identifies herself as Relay's AI assistant, states who she represents at the start of every call, and answers follow-up identity questions truthfully.
- **FR-CALL-004:** The agent never invents job facts, competing bids, or commitments.
- **FR-CALL-005:** Each call ends as an itemized quote, callback commitment, or documented decline.
- **FR-CALL-006:** Every provider webhook is authenticated where supported and processed idempotently.

## Quote extraction

- **FR-QUO-001:** A quote can record base price, labor, travel, fuel, stairs, long carry, packing, materials, insurance, taxes, other fees, discounts, and total.
- **FR-QUO-002:** The result distinguishes a binding quote, estimate, range, callback, and decline.
- **FR-QUO-003:** Extracted values carry source evidence and confidence.
- **FR-QUO-004:** Missing fees and assumptions remain visible rather than silently treated as zero.
- **FR-QUO-005:** Quotes are normalized to a comparable currency and service scope before ranking.

## Negotiation

- **FR-NEG-001:** The agent can ask about promotions, fee removal, price matching, discounts, and value-added terms.
- **FR-NEG-002:** The agent may reference only a real, compatible competing quote already gathered for the confirmed job.
- **FR-NEG-003:** At least one demonstrated negotiation changes price or terms because of gathered leverage.
- **FR-NEG-004:** A quote at least 30% below the comparable market baseline is flagged for review rather than automatically declared the winner.
- **FR-NEG-005:** The system records the strategy, price before and after, changed terms, saved amount, and supporting transcript segment.

## Comparison and reporting

- **FR-REP-001:** The system scores price, fee completeness, quote confidence, business reputation, service fit, and risk flags.
- **FR-REP-002:** Every completed quote is ranked; declines and callbacks remain visible but are not silently discarded.
- **FR-REP-003:** The recommendation explains the best value in plain language, not merely the lowest total.
- **FR-REP-004:** The report links to itemized fees, transcript evidence, and recording references.
- **FR-REP-005:** The dashboard shows money saved, time avoided, hidden fees uncovered, and live negotiation milestones.
- **FR-REP-006:** The report can later be exported as a PDF without changing the underlying comparison contract.

## Non-functional requirements

- **NFR-PERF-001:** User-visible call progress should update in under five seconds under normal demo conditions.
- **NFR-SCALE-001:** The orchestration model supports at least three concurrent calls for the MVP.
- **NFR-QUAL-001:** Transcript accuracy is measured against a target of 95%; confidence and manual review remain available.
- **NFR-REL-001:** Long-running work is durable, retryable, idempotent, and separate from HTTP request lifetimes.
- **NFR-SEC-001:** Secrets never enter browser bundles, source control, fixtures, transcripts, or logs.
- **NFR-PRIV-001:** Recording consent, AI disclosure, access, and retention are explicit product states.
- **NFR-OBS-001:** Jobs, calls, webhooks, quotes, and negotiation attempts share correlation identifiers.
- **NFR-DEV-001:** Build, lint, typecheck, unit test, and scaffold demo paths require no paid-provider credentials.
- **NFR-EXT-001:** A new vertical can supply fields, fee taxonomy, benchmarks, red flags, and levers without modifying core orchestration.

## Success measures

- Customer preparation time trends from approximately two hours of calls toward five minutes of guided intake and review.
- At least three businesses are contacted for the same confirmed specification.
- A demonstrated negotiation improves price or terms by truthful leverage; the planning target is 5-15%.
- The final recommendation ranks all structured quotes and cites evidence.
- The customer can identify why the recommended offer is trustworthy and why suspicious alternatives were downgraded.
