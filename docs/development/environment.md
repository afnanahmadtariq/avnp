# Environment variables

Status: Canonical catalog  
Owner: Engineering  
Last reviewed: 2026-07-19

Copy `.env.example` to `.env` for local development. Commit variable names and safe examples only; never commit real secrets. Browser exposure is limited to variables prefixed with `NUXT_PUBLIC_`.

The root `pnpm dev`, `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker` commands load this repository-level `.env` before Turbo starts an application. Existing shell variables take precedence over values in the file. Keep the file at the repository root rather than copying secrets into individual application directories.

## Active variables

These are the only variables read by the current Relay runtime. For the complete local product flow, only `DATABASE_URL` must be present; the others have safe local defaults.

| Variable               | Consumer     | Required when                     | Purpose                                                               | Secret |
| ---------------------- | ------------ | --------------------------------- | --------------------------------------------------------------------- | ------ |
| `NODE_ENV`             | API          | Production deployment             | Selects production behavior and disables fixture seeding              | No     |
| `APP_VERSION`          | API          | Recommended for deployments       | Release identifier returned by the health endpoint                    | No     |
| `API_HOST`             | API          | Bind override                     | API network bind host; defaults to `0.0.0.0`                          | No     |
| `API_PORT`             | API          | Port override                     | API port; defaults to `4000`                                          | No     |
| `CORS_ORIGINS`         | API          | Deployed browser access           | Comma-separated frontend origins allowed to call the API              | No     |
| `NUXT_PUBLIC_API_BASE` | Web          | Web and API use different origins | Browser-visible versioned API base URL                                | No     |
| `DATABASE_URL`         | Database/API | Persisted product routes or seed  | PostgreSQL 18 connection string; product routes return 503 without it | Yes    |

The Nuxt development port is currently fixed to `3000` by the web package script. `WEB_PORT` was removed from the template because the application did not read it.

## Reserved variables

The following names document the intended production adapters. They are not read by application code today, so adding credentials will not activate these services.

| Variable                            | Intended service         | Planned purpose                                     | Activation prerequisite                          |
| ----------------------------------- | ------------------------ | --------------------------------------------------- | ------------------------------------------------ |
| `REDIS_URL`                         | Redis/BullMQ             | Durable jobs, retries, and progress events          | Queue clients and worker processors              |
| `ELEVENLABS_API_KEY`                | ElevenLabs Agents        | Server access to the live voice agent               | Call-provider adapter and webhook ingestion      |
| `ELEVENLABS_AGENT_ID`               | ElevenLabs Agents        | Select the configured Relay negotiation agent       | Call-provider adapter                            |
| `TWILIO_ACCOUNT_SID`                | Twilio Voice             | Identify the telephony account                      | A chosen Twilio-owned call path                  |
| `TWILIO_AUTH_TOKEN`                 | Twilio Voice             | Authenticate calls and verify Twilio requests       | Twilio adapter and signature verification        |
| `TWILIO_FROM_NUMBER`                | Twilio Voice             | Approved caller number for outbound calls           | Provisioned or verified calling identity         |
| `OPENAI_API_KEY`                    | OpenAI API               | Quote extraction, document vision, and explanations | AI provider adapter and structured output schema |
| `OCR_PROVIDER`                      | Document intake selector | Choose `mock` or an implemented extraction provider | Upload and document-extraction pipeline          |
| `GOOGLE_PLACES_API_KEY`             | Google Places            | Discover real nearby businesses                     | Business-directory adapter                       |
| `YELP_API_KEY`                      | Yelp                     | Optional fallback business discovery                | Yelp directory adapter                           |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk                    | Browser-side authentication identifier              | Clerk Nuxt module and protected routes           |
| `CLERK_SECRET_KEY`                  | Clerk                    | Server-side session and user verification           | API authentication guards                        |
| `SUPABASE_URL`                      | Supabase Storage         | Storage project endpoint                            | Evidence-storage adapter                         |
| `SUPABASE_SERVICE_ROLE_KEY`         | Supabase Storage         | Privileged server access to private evidence        | Server-only storage adapter and access policy    |

See [Service and API setup](service-setup.md) for the exact account assets, recommended implementation order, and variables that still need to be designed with their adapters.

## Secret handling

Production values belong in the deployment platform's secret manager. Rotate any value that appears in source control, logs, screenshots, task output, or client bundles.

- Never prefix a secret with `NUXT_PUBLIC_`.
- Treat authenticated database and Redis URLs as secrets because they contain credentials.
- Keep provider credentials in the API or worker runtime only.
- Maintain separate development and production provider projects and keys.
