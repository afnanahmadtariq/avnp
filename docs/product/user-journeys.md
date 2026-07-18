# User journeys

Status: Canonical  
Owner: Product and design  
Last reviewed: 2026-07-19

## Primary moving journey

1. **Start:** the customer starts a moving negotiation and sees the recording, calling, and AI-disclosure expectations.
2. **Interview or upload:** an ElevenLabs voice interview asks estimator-grade questions; a supported document can add inventory or prior quote facts.
3. **Unify:** all inputs map into one structured moving specification with source and confidence metadata.
4. **Confirm:** the customer reviews, edits, and confirms a version. Calls cannot start before this state.
5. **Discover:** Relay finds suitable movers from a live provider or deterministic development fixtures.
6. **Approve call list:** invalid, duplicate, closed, or out-of-scope candidates are removed.
7. **Call:** at least three counterparties receive the same specification. Live status shows queued, dialing, connected, negotiating, callback, completed, declined, or failed.
8. **Extract:** each call produces an itemized quote or another structured terminal outcome.
9. **Negotiate:** truthful compatible bids and fee questions create leverage. At least one price or term changes in the demonstration.
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

- State that the agent is calling for the named customer.
- Answer “are you a robot?” honestly and continue politely.
- Never claim authority to book or pay unless that capability and user approval exist.
- Use only the confirmed job facts and compatible quotes as leverage.
- End by repeating the structured outcome and asking for any missing itemization.
