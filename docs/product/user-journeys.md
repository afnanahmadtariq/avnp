# User journeys

Status: Canonical  
Owner: Product and design  
Last reviewed: 2026-07-19

## Primary moving journey

1. **Start:** the customer signs in, starts a moving negotiation, and sees the calling, recording, and truthful-identity expectations.
2. **Interview or upload:** an ElevenLabs voice interview asks estimator-grade questions; a supported document can add inventory or prior quote facts.
3. **Unify:** all inputs map into one structured moving specification with source and confidence metadata.
4. **Confirm:** the customer reviews, edits, and confirms a version. Calls cannot start before this state.
5. **Discover:** Relay finds suitable movers from a live provider or deterministic development fixtures.
6. **Approve call list:** invalid, duplicate, closed, or out-of-scope candidates are removed.
7. **Call:** at least three counterparties receive the same specification. Live status shows queued, dialing, in progress, negotiating, completed, cancelled, or failed.
8. **Extract:** a completed transcript produces an itemized quote or an explicit callback, decline, unavailable, no-answer, busy, or failed outcome.
9. **Negotiate:** truthful compatible bids and fee questions create leverage. Relay automatically schedules at most one follow-up round for an eligible negotiation and the deterministic demonstration shows a measurable improvement.
10. **Compare:** Relay normalizes totals and fees, scores completeness and trust, and flags outliers.
11. **Recommend:** the customer receives a ranked comparison, best-value explanation, savings summary, and linked evidence.

## Failure and recovery journeys

- **No phone quote:** record the decline and reason; do not fabricate a range.
- **Callback promised:** capture the owner and expected time, schedule follow-up, and show the quote as pending.
- **Call interrupted:** retry within policy or request a human handoff; keep the attempt history.
- **Vague fee answer:** ask a targeted follow-up, record unresolved assumptions, and reduce completeness/confidence.
- **Suspicious lowball:** show the price but apply a risk flag when it is 30% or more below a comparable baseline.
- **Provider outage:** pause or retry the affected adapter while preserving job and attempt state.
- **User correction:** create a new specification version; do not mix quotes gathered against incompatible versions.

## Conversation trust checkpoints

- Introduce the caller briefly as Sara from Relay and state that she is calling for the named customer; do not claim to be a human employee.
- If someone asks whether the caller is automated, answer honestly and continue politely.
- Never claim authority to book or pay unless that capability and user approval exist.
- Use only the confirmed job facts and compatible quotes as leverage.
- End by repeating the structured outcome and asking for any missing itemization.
