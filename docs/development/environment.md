# Environment variables

Status: Canonical catalog  
Owner: Engineering  
Last reviewed: 2026-07-19

Copy `.env.example` to `.env` for local development. Commit variable names and safe examples only; never commit real secrets. Browser exposure is limited to variables prefixed with `NUXT_PUBLIC_`.

| Variable                            | Consumer            | Required when               | Purpose                                             |
| ----------------------------------- | ------------------- | --------------------------- | --------------------------------------------------- |
| `NODE_ENV`                          | All runtimes        | Always                      | Runtime mode                                        |
| `APP_VERSION`                       | API/worker          | Recommended                 | Release identifier in health and telemetry          |
| `WEB_PORT`                          | Web tooling         | Local override              | Intended web port                                   |
| `API_HOST`                          | API                 | API start                   | Bind host                                           |
| `API_PORT`                          | API                 | API start                   | Bind port                                           |
| `CORS_ORIGINS`                      | API                 | Browser API access          | Comma-separated allowed origins; local default only |
| `NUXT_PUBLIC_API_BASE`              | Web                 | Browser API access          | Public API base URL; contains no secret             |
| `DATABASE_URL`                      | Database/API/worker | Persistence enabled         | PostgreSQL 18 connection string                     |
| `REDIS_URL`                         | Queue/API/worker    | Queue enabled               | Redis connection string                             |
| `ELEVENLABS_API_KEY`                | Integration adapter | Live voice enabled          | ElevenLabs server credential                        |
| `ELEVENLABS_AGENT_ID`               | Integration adapter | Live voice enabled          | Configured agent identifier                         |
| `TWILIO_ACCOUNT_SID`                | Telephony adapter   | Direct Twilio path enabled  | Twilio account identifier                           |
| `TWILIO_AUTH_TOKEN`                 | Telephony adapter   | Direct Twilio path enabled  | Twilio server secret and webhook verification input |
| `TWILIO_FROM_NUMBER`                | Telephony adapter   | Live outbound calls         | Approved outbound number                            |
| `OPENAI_API_KEY`                    | AI adapter          | Provider extraction enabled | Server-side model credential                        |
| `OCR_PROVIDER`                      | Document adapter    | Document intake             | Selects mock or configured extraction provider      |
| `GOOGLE_PLACES_API_KEY`             | Discovery adapter   | Google discovery enabled    | Server-side Places credential                       |
| `YELP_API_KEY`                      | Discovery adapter   | Yelp discovery enabled      | Server-side Yelp credential                         |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web                 | Clerk enabled               | Public Clerk identifier                             |
| `CLERK_SECRET_KEY`                  | API                 | Clerk enabled               | Server-side Clerk secret                            |
| `SUPABASE_URL`                      | Storage adapter     | Supabase enabled            | Project endpoint                                    |
| `SUPABASE_SERVICE_ROLE_KEY`         | Server adapters     | Privileged Supabase access  | Server-only service credential                      |

Production values belong in the deployment platform's secret manager. Rotate any value that appears in source control, logs, screenshots, task output, or client bundles.
