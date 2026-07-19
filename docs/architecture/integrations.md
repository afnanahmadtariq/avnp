# Integration ownership

Status: Implemented; external credential smoke tests pending
Owner: Engineering  
Last reviewed: 2026-07-19

Provider SDK details and response types remain inside `@relay/integrations`. Applications and domain packages depend on Relay contracts and ports. Each live adapter has a deterministic no-network composition for fixture mode and default CI.

| Capability           | Live implementation                           | Fixture/local mode                              | Boundary responsibility                                                 |
| -------------------- | --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| Voice interview      | ElevenLabs signed conversation session        | Guided structured intake; no live voice session | Session creation, agent selection, transcript extraction, disclosure    |
| Outbound negotiation | ElevenLabs Agents native Twilio outbound call | Deterministic call provider                     | Dialing, status/recording retrieval, signed events, active cancellation |
| Market discovery     | Google Places API (New) Text Search           | Deterministic business fixtures                 | Field masks, callable-candidate filtering, normalization, deduplication |
| Structured reasoning | OpenAI Responses strict Structured Outputs    | Deterministic extraction fixture                | Interview and quote extraction, validation, source confidence           |
| Document extraction  | OpenAI Responses text/image/file input        | Mock document parser                            | File validation, structured job fields, evidence association            |
| Queue                | BullMQ on Redis                               | In-memory queue                                 | Durable jobs, retries, deduplication, progress, concurrency             |
| Persistence          | PostgreSQL 18 via Prisma                      | Local PostgreSQL 18.4                           | Transactions, schema push, idempotency, audit/outbox state              |
| Object storage       | Private Supabase Storage                      | Local fixture references                        | Documents, transcripts, recordings, signed access, retention metadata   |
| Authentication       | Clerk                                         | Local development identity                      | Bearer-session verification and user ownership                          |
| Hosting              | Nuxt/Nitro plus persistent API/worker         | Local processes                                 | Independently deployed web, API, and worker                             |

## Adapter guarantees

- Accept and return Relay contracts rather than exporting provider objects.
- Validate provider data and strict model output before persistence.
- Verify ElevenLabs webhook signatures against the raw body before acknowledging events.
- Preserve provider event IDs and timestamps for idempotency and out-of-order protection.
- Apply bounded timeouts, typed retryability, queue retry policies, and error classification.
- Avoid replaying an ambiguous billable call start.
- Redact credentials, phone numbers, document contents, and transcript text from ordinary logs.
- Offer deterministic implementations that require no network or paid calls.

## Call lifecycle ownership

ElevenLabs is the single agent and telephony lifecycle owner. Relay starts a native Twilio outbound call through ElevenLabs, stores the ElevenLabs conversation ID, polls conversation state, accepts signed post-call events, and retrieves transcript/audio evidence.

Twilio account credentials are not needed for call placement. When both optional Twilio server credentials are configured, Relay can map the ElevenLabs conversation to its Twilio call SID and end an already active call during cancellation. This does not create a second transport path.

The public callback is exactly `/api/v1/webhooks/elevenlabs`. Production configures signed `post_call_transcription` and `call_initiation_failure` events. The parser remains defensive around legacy audio payloads, but Relay does not enable `post_call_audio`; it retrieves consented audio through the authenticated conversation API instead.

## Data-schema policy

The repository intentionally has no Prisma migrations directory or migration commands. Prisma Client generation and reviewed schema synchronization use `pnpm db:generate` and `pnpm db:push`. `pnpm db:reset` deletes and recreates data and is restricted to an explicitly disposable local database.

## Remaining external validation

Adapter unit/integration behavior is implemented without real secrets. Production readiness still requires service-by-service credential smoke tests, a public HTTPS webhook check, one consented end-to-end call, managed-service backup/restore verification, and deployment monitoring.
