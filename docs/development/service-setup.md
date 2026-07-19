# Service and API setup

Status: Canonical live-stack checklist
Owner: Engineering  
Last reviewed: 2026-07-19

## Choose a runtime mode

Relay supports two complete runtime compositions through the same contracts.

- **Fixture mode** is the default for development and CI. It uses deterministic discovery, calls, extraction, and local evidence references. Persisted product routes need only `DATABASE_URL`; no paid API credential is required.
- **Live mode** uses PostgreSQL, Redis/BullMQ, Clerk, Google Places API (New), ElevenLabs Agents with native Twilio calling, OpenAI Responses, and private Supabase Storage.

Do not mix real customer data or phone numbers into fixture files. Live calls still require approved recording consent, an allowed destination, and the launch compliance review.

## Fixture-mode setup

The repository pins PostgreSQL 18.4 and Redis 8.8.0 on Alpine 3.23 by immutable multi-architecture image digest. Redis starts with the local stack so queue integration can be exercised, but fixture mode defaults to the in-memory queue.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infra/compose.yaml up -d
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev
```

The minimum persisted fixture configuration is:

```dotenv
RELAY_MODE=fixture
DATABASE_URL=postgresql://relay:relay@localhost:5432/relay
```

There is no Prisma migrations directory or migration workflow. `pnpm db:push` synchronizes the current schema without deleting existing data. `pnpm db:reset` is an explicit, destructive local-only reset followed by the deterministic seed; never run it against shared, staging, or production data.

## Live-mode configuration

Create separate development/staging and production accounts. A complete live environment selects every implemented provider explicitly:

```dotenv
NODE_ENV=production
RELAY_MODE=live
APP_VERSION=<release-id>
API_HOST=0.0.0.0
API_PORT=4000
API_PUBLIC_URL=https://api.example.com
CORS_ORIGINS=https://app.example.com
NUXT_PUBLIC_API_BASE=https://api.example.com/api/v1
PROVIDER_TIMEOUT_MS=20000

DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
QUEUE_PROVIDER=redis
REDIS_URL=rediss://<user>:<password>@<host>:6379

AUTH_PROVIDER=clerk
NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<pk_live_or_test>
CLERK_SECRET_KEY=<sk_live_or_test>

DISCOVERY_PROVIDER=google
GOOGLE_PLACES_API_KEY=<server-key>

CALL_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=<server-key>
ELEVENLABS_AGENT_ID=<negotiation-agent-id>
ELEVENLABS_INTERVIEW_AGENT_ID=<optional-intake-agent-id>
ELEVENLABS_PHONE_NUMBER_ID=<imported-phone-number-id>
ELEVENLABS_WEBHOOK_SECRET=<webhook-signing-secret>
TWILIO_ACCOUNT_SID=<optional-for-active-cancellation>
TWILIO_AUTH_TOKEN=<optional-for-active-cancellation>

AI_PROVIDER=openai
OCR_PROVIDER=openai
OPENAI_API_KEY=<project-server-key>
OPENAI_MODEL=gpt-5.6-luna

STORAGE_PROVIDER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
SUPABASE_STORAGE_BUCKET=relay-evidence
```

`API_PUBLIC_URL` is the public HTTPS API origin, without `/api/v1`. Relay appends the implemented ElevenLabs callback path. `CORS_ORIGINS` must list exact deployed web origins and cannot be `*` in live mode.

## What must be created

| Order | Service                           | What to set up                                                                                 | Relay purpose                                                                                              |
| ----- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1     | Managed PostgreSQL 18             | Database, least-privilege application user, TLS, backups, restore test, monitoring             | Durable users, jobs, specifications, calls, quotes, evidence metadata, decisions, audit events, and outbox |
| 2     | Managed Redis                     | TLS/authenticated Redis and one connection URL                                                 | BullMQ durability, retries, deduplication, progress, and three-call execution concurrency                  |
| 3     | Clerk                             | Separate app per environment, allowed origins/redirects, publishable key, secret key           | Browser sign-in, API bearer-session verification, and per-user ownership                                   |
| 4     | Google Places API (New)           | Google Cloud project, billing, enabled Places API (New), restricted server key, quotas         | Text Search (New), normalized callable moving-business candidates, ratings, reviews, and locations         |
| 5     | ElevenLabs Agents + Twilio number | Intake and negotiation agents, API key, imported Twilio phone number, signed post-call webhook | Voice intake sessions, outbound negotiation calls, transcript/audio events, and provider call status       |
| 6     | OpenAI API                        | Project, server key, billing/limits, model access                                              | Responses API structured extraction for documents, interviews, and call quotes                             |
| 7     | Supabase Storage                  | Project, private bucket, service-role key, retention policy                                    | Private source documents, transcripts, recordings, extraction JSON, and short-lived signed access          |

## Service-specific steps

### PostgreSQL 18 and Redis 8.8.0

1. Use the Compose services for local development or managed TLS services for deployment.
2. Set `DATABASE_URL`; authenticated database URLs are secrets.
3. Set `QUEUE_PROVIDER=redis` and `REDIS_URL` for a durable worker.
4. Generate Prisma Client, review the schema diff, then run `pnpm db:push` against the intended database.
5. Seed only an environment intended to contain the labeled deterministic demo fixture.

Production schema changes use a reviewed `db:push` with a verified backup and restore path. Relay intentionally does not use Prisma migration files or migration commands.

### Clerk

1. Create a Clerk application for the environment and configure the Relay origin and redirect URLs.
2. Copy its publishable key to `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
3. Copy its secret key to Relay's server-only `CLERK_SECRET_KEY`.
4. Keep `AUTH_PROVIDER=clerk`; the web obtains a session token and the NestJS API verifies it and enforces user ownership.

Relay intentionally uses `CLERK_SECRET_KEY`, even though some Clerk Nuxt examples use `NUXT_CLERK_SECRET_KEY`. The current code reads the Relay name above. See Clerk's [Nuxt quickstart](https://clerk.com/docs/quickstarts/nuxt/) and [key reference](https://clerk.com/docs/guides/development/clerk-environment-variables).

Set both `AUTH_PROVIDER=clerk` and `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` before the Nuxt/Vercel build starts. Clerk module inclusion is decided at build time; changing those variables requires a fresh deployment.

### Google Places API (New)

1. Create a Google Cloud project with billing and enable **Places API (New)**.
2. Create a server-side key restricted to Places API (New); add suitable application restrictions for the deployment network.
3. Set quotas and billing alerts, then add the key as `GOOGLE_PLACES_API_KEY`.
4. Keep `DISCOVERY_PROVIDER=google`.

Relay uses Text Search (New) with a field mask and keeps only candidates with a usable international phone number. Google documents account, billing, API enablement, and key restrictions in the [Places API (New) setup guide](https://developers.google.com/maps/documentation/places/web-service/get-api-key).

### ElevenLabs Agents and native Twilio calling

Relay has one call-lifecycle design: ElevenLabs owns the agent and native Twilio outbound-call initiation. There is no second Relay-owned Twilio transport.

1. Create the negotiation agent from the checked-in [agent prompt and dynamic-variable contract](elevenlabs-agent.md), including disclosure, truthful-leverage rules, timeouts, and recording policy.
2. Create a dedicated interview agent when the intake behavior differs. Set `ELEVENLABS_INTERVIEW_AGENT_ID`; otherwise Relay uses `ELEVENLABS_AGENT_ID` for both experiences. Add a string dynamic-variable placeholder named `relay_intake_session_id`; Relay supplies a one-time server reservation when the browser session starts and verifies that same value before importing a transcript.
3. Provision a voice-capable Twilio number, import it into ElevenLabs, assign it to the negotiation agent, and record the resulting ElevenLabs phone-number ID.
4. Create an ElevenLabs API key for the server/worker.
5. Configure only signed `post_call_transcription` and `call_initiation_failure` events to:

   ```text
   https://<api-host>/api/v1/webhooks/elevenlabs
   ```

6. Store the matching signing secret as `ELEVENLABS_WEBHOOK_SECRET`.
7. Test only approved destinations and keep country permissions and spending limits narrow.

The live call starts through ElevenLabs' [native Twilio outbound-call endpoint](https://elevenlabs.io/docs/api-reference/twilio/outbound-call/), and Relay verifies the `elevenlabs-signature` header before processing each event idempotently. ElevenLabs documents event types in its [post-call webhook guide](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks).

Twilio credentials are not required by Relay to place a native ElevenLabs call. Add both `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` only when cancelling a run must also terminate an already active Twilio call. Without them, Relay records cancellation but the provider cancellation job cannot end the underlying active call.

### OpenAI Responses

1. Create a project-scoped API key, billing budget, and usage/rate limits.
2. Store the key only as `OPENAI_API_KEY` in API/worker secrets.
3. Set both `AI_PROVIDER=openai` and `OCR_PROVIDER=openai`.
4. Keep the production application model pinned explicitly as `OPENAI_MODEL=gpt-5.6-luna`.

Set `OPENAI_MODEL=gpt-5.6-luna` explicitly in live configuration. Relay sends document/image/text and transcript inputs to the Responses API with `store: false`, strict JSON Schema output, and application-side contract validation. GPT-5.6 Luna supports image input, Responses, and Structured Outputs and is positioned for cost-sensitive workloads in the official [model reference](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

### Supabase private storage

1. Create a Supabase project and a private bucket, then set `SUPABASE_STORAGE_BUCKET=relay-evidence` explicitly in live configuration.
2. Keep the bucket private; never enable public object access.
3. Configure file-size/content-type controls, retention/deletion policy, and environment separation.
4. Store the project URL and service-role key only in the API/worker secret store.

Relay stores uploaded sources, interview/call transcripts, recordings, and structured extraction evidence. The authenticated `GET /api/v1/evidence/:evidenceId/access` route verifies job ownership and retention, then returns a five-minute signed URL with `Cache-Control: no-store`. Supabase describes private buckets and signed access in [Storage bucket fundamentals](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Credential and launch checklist

- Put real values in a local ignored `.env` or the deployment secret manager; never in `.env.example`, client bundles, screenshots, logs, fixtures, or task output.
- Only `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intended for browser exposure. Treat database/Redis URLs and every other provider credential as server-only secrets.
- Use distinct provider projects, agents, phone numbers, buckets, databases, and keys for staging and production.
- Rotate any credential exposed in repository history or output.
- Run the default fixture quality gate before paid smoke tests: `pnpm check`.
- Run real-credential smoke tests service by service, then one consented end-to-end call. Those external validation and deployment steps remain pending until credentials and public endpoints are supplied.
