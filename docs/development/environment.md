# Environment variables

Status: Canonical catalog  
Owner: Engineering  
Last reviewed: 2026-07-19

Copy `.env.example` to the repository-root `.env` for local development. The root `pnpm dev`, `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker` commands load it before Turbo starts applications. Existing shell variables take precedence.

Fixture mode needs no paid provider credentials. `DATABASE_URL` is the only value required for its persisted product routes. Live mode validates the selected provider values at startup and fails with the missing variable names.

## Runtime and network

| Variable               | Consumer         | Required when                 | Purpose                                                                          | Secret |
| ---------------------- | ---------------- | ----------------------------- | -------------------------------------------------------------------------------- | ------ |
| `NODE_ENV`             | Web, API, worker | Deployment                    | `development`, `test`, or `production`; production defaults Relay to live mode   | No     |
| `RELAY_MODE`           | API, worker      | Recommended always            | `fixture` or `live`; controls the default provider composition                   | No     |
| `APP_VERSION`          | API, worker      | Recommended for deployment    | Release identifier exposed by health/telemetry                                   | No     |
| `API_HOST`             | API              | Bind override                 | Listen host; defaults to `0.0.0.0`                                               | No     |
| `API_PORT`             | API              | Port override                 | Listen port; defaults to `4000`                                                  | No     |
| `API_PUBLIC_URL`       | Worker           | Always in live mode           | Public HTTPS API origin; Relay appends `/api/v1/webhooks/elevenlabs`             | No     |
| `CORS_ORIGINS`         | API/auth         | Deployed browser access       | Comma-separated exact web origins; `*` is rejected in live mode                  | No     |
| `NUXT_PUBLIC_API_BASE` | Web              | API differs from local origin | Browser-visible versioned API base, for example `https://api.example.com/api/v1` | No     |
| `PROVIDER_TIMEOUT_MS`  | API, worker      | Optional                      | Provider request timeout from 1,000 to 120,000 ms; defaults to `20000`           | No     |

The Nuxt development port is fixed to `3000` by the package script. The generated web runtime reads `NUXT_PUBLIC_API_BASE`, so set it to the deployed versioned API origin before building each environment. Credentialed deployment smoke testing remains a launch gate.

## Persistence and queue

| Variable         | Consumer              | Required when                         | Purpose                                                              | Secret |
| ---------------- | --------------------- | ------------------------------------- | -------------------------------------------------------------------- | ------ |
| `DATABASE_URL`   | Database, API, worker | Persisted routes; always in live mode | PostgreSQL 18 connection URL                                         | Yes    |
| `QUEUE_PROVIDER` | API, worker           | Recommended always                    | `memory` or `redis`; live mode defaults to `redis`                   | No     |
| `REDIS_URL`      | API, worker           | `QUEUE_PROVIDER=redis`                | BullMQ connection URL for jobs, retries, deduplication, and progress | Yes    |

Local Compose pins PostgreSQL 18.4 and Redis 8.8.0 on Alpine 3.23. The local example URLs contain disposable development credentials; deployed database and Redis URLs are secrets.

## Provider selectors

| Variable             | Fixture value | Live value   | Purpose                                                         |
| -------------------- | ------------- | ------------ | --------------------------------------------------------------- |
| `AUTH_PROVIDER`      | `local`       | `clerk`      | Selects local deterministic identity or verified Clerk sessions |
| `DISCOVERY_PROVIDER` | `fixture`     | `google`     | Selects deterministic candidates or Google Places API (New)     |
| `CALL_PROVIDER`      | `fixture`     | `elevenlabs` | Selects simulated calls or ElevenLabs native Twilio calls       |
| `AI_PROVIDER`        | `fixture`     | `openai`     | Selects deterministic or OpenAI quote/interview extraction      |
| `OCR_PROVIDER`       | `mock`        | `openai`     | Selects deterministic or OpenAI document extraction             |
| `STORAGE_PROVIDER`   | `local`       | `supabase`   | Selects fixture evidence references or private Supabase Storage |

With `RELAY_MODE=live`, the runtime defaults these selectors to their live values. Set them explicitly in deployment configuration so the composition is auditable.

## Authentication

| Variable                            | Consumer        | Required when         | Purpose                                                              | Secret |
| ----------------------------------- | --------------- | --------------------- | -------------------------------------------------------------------- | ------ |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web, API config | `AUTH_PROVIDER=clerk` | Clerk browser publishable key and authentication instance identifier | No     |
| `CLERK_SECRET_KEY`                  | API             | `AUTH_PROVIDER=clerk` | Server-side Clerk session-token and user verification                | Yes    |

Relay uses `CLERK_SECRET_KEY`; do not rename it to the alternative name shown in some framework examples.

## Discovery

| Variable                | Consumer | Required when               | Purpose                                            | Secret |
| ----------------------- | -------- | --------------------------- | -------------------------------------------------- | ------ |
| `GOOGLE_PLACES_API_KEY` | Worker   | `DISCOVERY_PROVIDER=google` | Restricted server key for Places Text Search (New) | Yes    |

Google Places is the only implemented live discovery provider. Deterministic fixtures remain the no-credential option.

## Voice and telephony

| Variable                        | Consumer    | Required when                     | Purpose                                                                                  | Secret |
| ------------------------------- | ----------- | --------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| `ELEVENLABS_API_KEY`            | API, worker | `CALL_PROVIDER=elevenlabs`        | Signed interview-session creation, outbound calls, conversations, transcripts, and audio | Yes    |
| `ELEVENLABS_AGENT_ID`           | API, worker | `CALL_PROVIDER=elevenlabs`        | Negotiation agent; also the intake fallback                                              | No     |
| `ELEVENLABS_INTERVIEW_AGENT_ID` | API         | Optional with ElevenLabs          | Dedicated voice-intake agent; falls back to `ELEVENLABS_AGENT_ID`                        | No     |
| `ELEVENLABS_PHONE_NUMBER_ID`    | Worker      | `CALL_PROVIDER=elevenlabs`        | ElevenLabs identifier for the imported native Twilio number                              | No     |
| `ELEVENLABS_WEBHOOK_SECRET`     | API         | `CALL_PROVIDER=elevenlabs`        | HMAC secret for `elevenlabs-signature` verification                                      | Yes    |
| `TWILIO_ACCOUNT_SID`            | Worker      | Optional active-call cancellation | Identifies the Twilio account containing the underlying call                             | Yes    |
| `TWILIO_AUTH_TOKEN`             | Worker      | Optional active-call cancellation | Authenticates the Twilio request that terminates an active call                          | Yes    |

Twilio credentials are not used to place calls; ElevenLabs' native Twilio endpoint does that. Configure both Twilio values together only if Relay must terminate an already active provider call when a run is cancelled.

## Structured extraction

| Variable         | Consumer    | Required when                                 | Purpose                                            | Secret |
| ---------------- | ----------- | --------------------------------------------- | -------------------------------------------------- | ------ |
| `OPENAI_API_KEY` | API, worker | `AI_PROVIDER=openai` or `OCR_PROVIDER=openai` | Server key for Responses API structured extraction | Yes    |
| `OPENAI_MODEL`   | API, worker | OpenAI selected                               | Model identifier; defaults to `gpt-5.6-luna`       | No     |

The same OpenAI Responses adapter handles text, image, document, interview, and call transcript extraction with strict JSON Schema output.

## Evidence storage

| Variable                    | Consumer    | Required when               | Purpose                                                      | Secret |
| --------------------------- | ----------- | --------------------------- | ------------------------------------------------------------ | ------ |
| `SUPABASE_URL`              | API, worker | `STORAGE_PROVIDER=supabase` | Supabase project endpoint                                    | No     |
| `SUPABASE_SERVICE_ROLE_KEY` | API, worker | `STORAGE_PROVIDER=supabase` | Privileged server-only access to the private evidence bucket | Yes    |
| `SUPABASE_STORAGE_BUCKET`   | API, worker | `STORAGE_PROVIDER=supabase` | Private bucket name; defaults to `relay-evidence`            | No     |

The service-role key bypasses ordinary browser authorization and must never enter a client bundle. Keep the bucket private and expose evidence only through authorized, short-lived signed access.

## Secret handling

- Commit names and safe examples only; never commit real values.
- Only `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is intentionally browser-exposed. `NUXT_PUBLIC_API_BASE` is public configuration, not a credential.
- Keep provider credentials in the API/worker environment or a deployment secret manager.
- Use separate values per environment and rotate any credential that appears in repository history, logs, screenshots, task output, or client bundles.
- Limit key scope, provider quotas, phone destinations, and spend independently of application checks.

See [Service and API setup](service-setup.md) for account creation, webhook configuration, exact purposes, and the live launch checklist.
