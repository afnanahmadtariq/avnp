# Service and API setup

Status: Canonical setup checklist  
Owner: Engineering  
Last reviewed: 2026-07-19

## Short answer

No paid API account is required to run Relay today. The complete local flow uses PostgreSQL 18 and a disclosed deterministic provider. Provider variables in `.env.example` are reserved names only; the current runtime does not read them.

Do not purchase subscriptions or paste production keys into `.env` until the matching adapter, webhook verification, failure handling, and tests have been implemented.

## Set up now

| Setup                   | Required | What to create                                  | Relay purpose                                      |
| ----------------------- | -------- | ----------------------------------------------- | -------------------------------------------------- |
| Node.js 24.18.0         | Yes      | Install through the team's Node version manager | Exact application runtime                          |
| Docker                  | Yes      | Docker Desktop or a compatible engine           | Runs local PostgreSQL 18.4 and optional Redis      |
| PostgreSQL 18           | Yes      | Use the repository Compose service              | Persists users, briefs, calls, quotes, and reports |
| Redis                   | No       | Already included in Compose                     | Reserved for future BullMQ orchestration           |
| Third-party API account | No       | None for the deterministic local application    | Not consumed yet                                   |

The smallest functional local `.env` is:

```dotenv
NODE_ENV=development
APP_VERSION=0.0.0
API_HOST=0.0.0.0
API_PORT=4000
CORS_ORIGINS=http://localhost:3000
NUXT_PUBLIC_API_BASE=http://localhost:4000/api/v1
DATABASE_URL=postgresql://relay:relay@localhost:5432/relay
```

Start the infrastructure and initialize a clean database with:

```bash
docker compose -f infra/compose.yaml up -d
pnpm db:generate
pnpm db:reset
pnpm dev
```

`pnpm db:reset` deliberately replaces local data and pushes the Prisma schema without a migrations directory.

## Production services to prepare after adapter implementation

| Order | Service                   | Account assets to create                                                 | Environment configuration                         | Exact purpose in Relay                                     |
| ----- | ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| 1     | Managed PostgreSQL 18     | PostgreSQL 18 database, application user, backups, TLS                   | `DATABASE_URL`                                    | Durable product and audit data                             |
| 2     | Clerk                     | Development and production applications, allowed origins, API keys       | Clerk publishable and server verification values  | Sign-in, sessions, and per-user data ownership             |
| 3     | Managed Redis             | TLS-enabled database and authenticated connection URL                    | `REDIS_URL`                                       | BullMQ jobs, retries, concurrency, and progress events     |
| 4     | Google Places API (New)   | Google Cloud project, billing account, enabled API, restricted key       | `GOOGLE_PLACES_API_KEY`                           | Find and normalize real nearby moving businesses           |
| 5     | ElevenLabs Agents + phone | Workspace, configured agent, API key, connected phone identity           | ElevenLabs agent and phone identifiers            | Conduct the voice negotiation and return call events       |
| 6     | Twilio Voice, if selected | Account, approved number or verified caller ID, calling permissions      | Twilio SID, token, and caller number              | Phone transport when Relay owns Twilio call creation       |
| 7     | Private object storage    | Supabase project, private evidence bucket, retention and access policies | Supabase URL, service role, and bucket identifier | Recordings, transcripts, documents, and time-limited links |
| 8     | OpenAI API                | API project, server key, billing and usage limits                        | `OPENAI_API_KEY` plus a model setting             | Structured quote extraction, document vision, explanations |

Yelp is an optional fallback to Google Places. A separate OCR vendor is optional if the selected OpenAI model handles document vision. Neither should be set up for the first live pilot unless the primary path proves insufficient.

## Voice and telephony decision

Choose one owner for the call lifecycle before adding credentials.

### Recommended first pilot: ElevenLabs native Twilio integration

This is the smaller operational surface. Create a Twilio account and voice-capable number, import that number into ElevenLabs, assign it to the Relay agent, and let Relay initiate the call through the ElevenLabs outbound-call API. ElevenLabs documents both the [native Twilio setup](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration) and the [outbound API](https://elevenlabs.io/docs/api-reference/twilio/outbound-call/).

For this design:

- The ElevenLabs API key, agent ID, and ElevenLabs phone-number ID belong in the Relay worker.
- Twilio credentials are used to import/configure the number in ElevenLabs and may not need to remain in the Relay runtime.
- Relay still needs a public HTTPS webhook endpoint for verified conversation events.

### Advanced alternative: Relay-owned Twilio transport

Use this only if Relay needs custom Twilio routing or full call-control logic. The worker creates Twilio calls, connects them to ElevenLabs, and owns status callbacks. This path requires the Twilio SID, auth token, caller number, public HTTPS callback URLs, and Twilio signature verification. Twilio requires HTTPS webhook handling and recommends verifying every request; see [Twilio Voice webhooks](https://www.twilio.com/docs/usage/webhooks/voice-webhooks).

Do not implement both lifecycle paths at the same time.

## What each external service must be configured to do

### ElevenLabs Agents

1. Create a Relay negotiation agent.
2. Configure its opening disclosure, tool calls, dynamic job variables, timeouts, and allowed behavior.
3. Connect a voice-capable number.
4. Record the API key, agent ID, and phone-number ID.
5. Configure signed conversation events to Relay's public API.
6. Test one restricted-number call before enabling customer-provided destinations.

### Twilio Voice

1. Create separate development and production subaccounts when practical.
2. Purchase a voice-capable number or verify an outbound caller ID.
3. Configure permitted destination countries and spending limits.
4. Import the number into ElevenLabs for the recommended path.
5. If Relay owns transport, configure status and recording callbacks and verify signatures with the auth token.

### OpenAI API

1. Create a project-scoped server key in the OpenAI platform.
2. Add billing and a conservative project usage limit.
3. Keep `OPENAI_API_KEY` in the API/worker secret store only.
4. Select and configure the model when the structured extraction adapter is implemented.
5. Enforce Relay's Zod contracts on model output; never persist unvalidated provider output.

The official [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request) covers project keys and server-side configuration.

### Google Places API

1. Create a Google Cloud project and billing account.
2. Enable Places API (New).
3. Create a server-side API key restricted to the Places API and, in production, the expected server egress.
4. Set quotas and billing alerts.
5. Return only required fields and normalize results into Relay business contracts.

Google's [Places setup guide](https://developers.google.com/maps/documentation/places/web-service/get-api-key) requires billing and recommends API restrictions.

### Clerk

1. Create separate development and production Clerk applications.
2. Configure the Relay web origins and redirect URLs.
3. Add the Nuxt SDK and protected routes before adding keys.
4. Pass the signed session token to the NestJS API and verify it there.
5. Replace the single local demo identity with the verified Clerk user ID.

Clerk's [Nuxt quickstart](https://clerk.com/docs/quickstarts/nuxt/) currently uses `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NUXT_CLERK_SECRET_KEY`. Relay's final adapter must standardize the web and API variable names before credentials are added.

### Supabase Storage

1. Create a project and a private `relay-evidence` bucket.
2. Define recording, transcript, and uploaded-document retention policies.
3. Keep the service-role key in the server/worker secret store only.
4. Expose evidence through short-lived signed URLs, never a public bucket.
5. Implement deletion and ownership checks before accepting personal uploads.

Supabase documents private file handling in its [Storage guide](https://supabase.com/docs/guides/storage).

## Configuration that must be added with the adapters

The following values are necessary for a real deployment but their names are intentionally not frozen until their consuming code is implemented:

- Public API/webhook base URL.
- Provider selectors for call, discovery, AI, and storage modes.
- ElevenLabs phone-number ID and webhook signing secret.
- Storage bucket name.
- OpenAI model/configuration identifier.
- Clerk webhook signing secret if user synchronization uses webhooks.
- OCR-provider-specific endpoint, project, region, and credentials if a separate OCR service is selected.
- Notification provider credentials when email/SMS delivery is implemented.
- Error monitoring or OpenTelemetry configuration.

Every new variable must be validated at startup, added to `.env.example` without a real value, catalogued in `environment.md`, included in Turbo's environment allowlist when required, and covered by a missing-configuration test.

## Security rule

Provider secrets belong only in a deployment secret manager or the ignored local `.env`. Never commit them, place them in `NUXT_PUBLIC_*` variables, expose them in screenshots, or send them to the browser. Rotate any credential that appears in repository history, logs, or task output.
