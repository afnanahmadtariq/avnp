# Integration ownership

Status: Planned  
Owner: Engineering  
Last reviewed: 2026-07-19

Provider SDKs and response types remain inside `@relay/integrations`. Applications and domain packages depend on Relay contracts and ports.

| Capability                | Primary option                       | Alternative / local mode          | Boundary responsibility                                        |
| ------------------------- | ------------------------------------ | --------------------------------- | -------------------------------------------------------------- |
| Voice interview and agent | ElevenLabs Agents                    | Deterministic interview fixtures  | Session creation, tools, transcript events, disclosure prompts |
| Outbound phone transport  | ElevenLabs telephony with Twilio/SIP | Human role-play or counter-agent  | Number provisioning, dialing, status callbacks                 |
| Market discovery          | Google Places                        | Yelp or deterministic fixtures    | Search, deduplication, normalized business contract            |
| Structured reasoning      | OpenAI model                         | Deterministic extraction fixtures | Contract-constrained extraction and explanations               |
| Document extraction       | Vision/OCR adapter                   | Fixture parser                    | File validation, extraction, source spans, confidence          |
| Queue                     | BullMQ on Redis                      | In-memory test double             | Durable jobs, retries, deduplication, progress events          |
| Persistence               | PostgreSQL via Prisma                | Test database                     | Transactions, schema, migrations, idempotency                  |
| Object storage            | Supabase Storage or S3-compatible    | Local fixture references          | Uploads, recordings, signed access, retention                  |
| Authentication            | Clerk                                | Development identity adapter      | Session verification and user ownership                        |
| Hosting                   | Nuxt/Nitro + persistent services     | Local processes                   | Web, API, and worker independent deployment                    |

## Adapter expectations

- Accept and return Relay contracts rather than exporting provider objects.
- Validate webhook signatures before acknowledging events.
- Preserve provider event IDs and timestamps for idempotency and diagnostics.
- Define timeouts, retryability, rate-limit behavior, and error classification.
- Redact credentials, phone numbers, document contents, and transcript text from ordinary logs.
- Offer a deterministic test implementation without network or paid calls.

## ElevenLabs and Twilio responsibility

The final live-call design must explicitly choose whether ElevenLabs owns the agent plus telephony integration or whether the platform connects an ElevenLabs agent through a separately managed Twilio/SIP layer. Avoid duplicate call lifecycle ownership. Record the choice as an ADR after the first verified end-to-end call.
