# Security, privacy, and conversation safety

Status: Required design baseline  
Owner: Security and product  
Last reviewed: 2026-07-19

This is engineering guidance, not legal advice. Calling, recording, automated-agent disclosure, data retention, and consent requirements vary by jurisdiction and must be reviewed before live production use.

## Hard product constraints

- Do not invent inventory, service requirements, competing bids, identities, authority, or commitments.
- Introduce the caller as Sara, Relay's AI assistant, at the start of every call and answer follow-up identity questions truthfully.
- Obtain and record the required customer and call-recording consent before storing audio.
- Permit human intervention, cancellation, and deletion requests through explicit states.
- Keep evidence of which confirmed specification and real quote supported each negotiation claim.

## Data classes

- **Secrets:** API keys, webhook secrets, auth keys, database credentials. Server-only and never logged.
- **Customer personal data:** names, phone numbers, addresses, move dates, inventory, documents. Least-privilege access and field-aware redaction.
- **Conversation evidence:** recordings and transcripts. Restricted access, consent metadata, encryption, and explicit retention.
- **Business data:** public listing data plus negotiation outcomes. Access still follows customer ownership and provider terms.
- **Telemetry:** identifiers, timing, statuses, and safe error classifications. Avoid raw content by default.

## Minimum controls before live calling

1. Verify authentication and job ownership on every customer route.
2. Validate all inbound contracts and uploaded file type/size.
3. Verify provider webhook signatures and enforce idempotency.
4. Encrypt data in transit and use managed at-rest encryption.
5. Store only object references in ordinary logs and queue payloads.
6. Use signed, expiring URLs for documents, recordings, and transcript exports.
7. Define retention and deletion behavior for raw evidence and derived facts.
8. Add rate limits, outbound-call allow/deny controls, and abuse monitoring.
9. Separate development fixtures from live phone numbers and accounts.
10. Audit consent, disclosure, confirmation, negotiation leverage, and report access events.

## Prompt and tool safety

Conversation prompts are untrusted execution contexts. Provider tools must validate structured arguments, authorize the current job/run, and apply policy independent of model instructions. A model cannot directly write arbitrary prices, mark consent, select a real phone target, or claim a competing bid without verified application data.
