# Production deployment

Status: Ready for infrastructure provisioning

Owner: Engineering

Last reviewed: 2026-07-19

This runbook deploys the Relay web application to Vercel and the API and worker to one Docker-enabled virtual machine. PostgreSQL, Redis, Clerk, Google Places, ElevenLabs/Twilio, OpenAI, and Supabase remain managed services. The production hostnames are:

- Web: `https://relay.zerotools.online`
- API: `https://api.zerotools.online`
- API health: `https://api.zerotools.online/api/v1/health`
- ElevenLabs webhook: `https://api.zerotools.online/api/v1/webhooks/elevenlabs`

## Deployment topology

```text
Browser
  -> Cloudflare DNS
     -> relay.zerotools.online -> Vercel -> Nuxt web
     -> api.zerotools.online   -> Caddy on VM -> NestJS API
                                              -> BullMQ -> NestJS worker

API and worker
  -> managed PostgreSQL 18
  -> managed Redis
  -> Clerk, Google Places, ElevenLabs/Twilio, OpenAI, Supabase APIs
```

The checked-in production artifacts are:

- [`infra/production/Dockerfile`](../../infra/production/Dockerfile) builds the shared API/worker runtime image.
- [`infra/production/compose.yaml`](../../infra/production/compose.yaml) runs the API, worker, and Caddy on the VM.
- [`infra/production/Caddyfile`](../../infra/production/Caddyfile) terminates HTTPS for the API and proxies only to the API container.
- [`.github/workflows/deploy-vm.yml`](../../.github/workflows/deploy-vm.yml) builds the runtime image, publishes it to GHCR, and updates the VM.
- [`.env.prod.example`](../../.env.prod.example) is the safe production configuration template.
- `.env.prod` is the ignored administrator copy used to populate the protected GitHub `PROD_ENV_FILE` environment secret. The workflow writes that secret to `.env` on the VM. Neither file may be committed, uploaded as a build artifact, or copied to Vercel.

## Runtime version policy

Development and CI are reproducible on the exact Node.js `24.18.0` pin in `.nvmrc` and `.node-version`. pnpm is pinned to `11.15.0` through `packageManager`.

Package manifests use the compatible deployment range `24.x`. Vercel selects only a Node major version and may run a different supported Node 24 patch. An exact `engines.node=24.18.0` rejects Vercel's selected patch during `pnpm install`, which caused the earlier deployment failure. The Docker runtime and CI remain explicitly pinned; the `24.x` manifest range exists only to allow provider-managed Node 24 patch updates.

## Accounts and infrastructure to provision

Create separate production assets. Do not reuse local, preview, or personal development credentials.

| Service                   | Production asset                                                                                      | Why Relay needs it                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Vercel                    | One project connected to this repository                                                              | Builds and serves the Nuxt web application                             |
| Linux VM                  | Docker Engine, Compose plugin, public IPv4, ports 80/443                                              | Runs the persistent API, worker, and HTTPS proxy                       |
| GitHub Container Registry | Private Relay runtime package                                                                         | Stores immutable API/worker images keyed by Git SHA                    |
| Cloudflare                | DNS zone for `zerotools.online`                                                                       | Routes the web and API hostnames                                       |
| Managed PostgreSQL        | PostgreSQL 18 database with TLS, backups, and a least-privilege app user                              | Durable product and audit data                                         |
| Managed Redis             | TLS/authenticated Redis                                                                               | BullMQ jobs, retries, progress, and deduplication                      |
| Clerk                     | Production application                                                                                | Browser sign-in and API bearer-token verification                      |
| Google Cloud              | Places API (New), billing, quotas, restricted server key                                              | Discovers callable businesses                                          |
| ElevenLabs and Twilio     | Two agents if intake differs from negotiation, an imported voice-capable number, and a signed webhook | Voice intake and outbound negotiation calls                            |
| OpenAI                    | Project-scoped server API key, model access, and spending limits                                      | Structured transcript and document extraction                          |
| Supabase                  | Project and private `relay-evidence` bucket                                                           | Private transcripts, recordings, source files, and extraction evidence |

Resend is intentionally not required for the current end-to-end product. Relay stores notification preferences but does not yet deliver outbound email. Add Resend only with the future email-delivery feature, its unsubscribe/bounce handling, and an explicit data-flow review.

## 1. Prepare production configuration

Copy the tracked template to the ignored file on an administrator workstation:

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Fill every required value. Do not leave placeholder text in a live deployment.

### Safe fixed values

```dotenv
NODE_ENV=production
RELAY_MODE=live
API_HOST=0.0.0.0
API_PORT=4000
API_PUBLIC_URL=https://api.zerotools.online
CORS_ORIGINS=https://relay.zerotools.online
PROVIDER_TIMEOUT_MS=20000

QUEUE_PROVIDER=redis
AUTH_PROVIDER=clerk
DISCOVERY_PROVIDER=google
CALL_PROVIDER=elevenlabs
AI_PROVIDER=openai
OCR_PROVIDER=openai
OPENAI_MODEL=gpt-5.6-luna
STORAGE_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET=relay-evidence
```

`APP_VERSION` is not stored in `.env.prod` or the `PROD_ENV_FILE` secret. The deployment workflow passes the verified Git SHA into the Docker build, and the immutable image exposes that SHA through API health. `API_PUBLIC_URL` is an origin without `/api/v1`; Relay appends its webhook path. `CORS_ORIGINS` is the exact browser origin, with no wildcard and no trailing slash.

### Required production values

| Variable                            | Source                       | Consumer and purpose                                        | Secret |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------- | ------ |
| `DATABASE_URL`                      | Managed PostgreSQL           | API/worker persistence; require TLS                         | Yes    |
| `REDIS_URL`                         | Managed Redis                | API/worker BullMQ connection; require TLS/auth              | Yes    |
| `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production app         | Shared Clerk instance identifier                            | No     |
| `CLERK_SECRET_KEY`                  | Clerk production app         | API token verification                                      | Yes    |
| `GOOGLE_PLACES_API_KEY`             | Google Cloud                 | Server-side Places Text Search (New)                        | Yes    |
| `ELEVENLABS_API_KEY`                | ElevenLabs                   | Interview sessions, calls, transcripts, and audio retrieval | Yes    |
| `ELEVENLABS_AGENT_ID`               | ElevenLabs negotiation agent | Outbound negotiation agent                                  | No     |
| `ELEVENLABS_PHONE_NUMBER_ID`        | ElevenLabs imported number   | Native Twilio outbound calling                              | No     |
| `ELEVENLABS_WEBHOOK_SECRET`         | ElevenLabs webhook           | Raw-body HMAC verification                                  | Yes    |
| `OPENAI_API_KEY`                    | OpenAI production project    | Responses API structured extraction                         | Yes    |
| `SUPABASE_URL`                      | Supabase project             | Private evidence storage endpoint                           | No     |
| `SUPABASE_SERVICE_ROLE_KEY`         | Supabase project settings    | Server-only private bucket access                           | Yes    |

### Optional values

| Variable                                     | Add only when                                              | Purpose                                                          |
| -------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `ELEVENLABS_INTERVIEW_AGENT_ID`              | Intake uses a separate agent                               | Otherwise intake falls back to `ELEVENLABS_AGENT_ID`             |
| `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` | Relay must actively terminate an in-progress provider call | Both values are required together; ElevenLabs still places calls |

`NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is browser-safe. Every other credential stays on the VM. The API also requires the publishable key during live-configuration validation so the browser and API configuration remain aligned; token verification uses `CLERK_SECRET_KEY`.

## 2. Configure and deploy the Vercel web project

1. Import the GitHub repository into Vercel as one project.
2. Set **Root Directory** to `apps/web`.
3. Keep the detected framework as **Nuxt.js** and use the checked-in install/build configuration. Because `apps/web` imports workspace packages, allow the build to include source files outside the root directory if Vercel presents that monorepo option.
4. Select Node.js **24.x** in project settings. The project manifests accept provider-managed Node 24 patches; CI still uses exact `24.18.0`.
5. Add these variables to the **Production** environment before the first build:

   ```dotenv
   AUTH_PROVIDER=clerk
   NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk production publishable key>
   NUXT_PUBLIC_API_BASE=https://api.zerotools.online/api/v1
   ```

6. Do not put `CLERK_SECRET_KEY`, database/Redis URLs, or any provider server key in Vercel.
7. Deploy once and verify the generated Vercel URL before attaching the custom domain.

`AUTH_PROVIDER` and `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are build-time requirements. Nuxt decides whether to bundle the Clerk module while it builds. Adding those values only after a deployment has finished does not enable authentication; redeploy after changing them.

Vercel automatically builds production deployments from `main`. Preview deployments must use separate staging providers and a staging API; never point an untrusted preview branch at production calling, database, Redis, or storage credentials.

See Vercel's official [monorepo project guidance](https://vercel.com/docs/projects) and [custom-domain setup](https://vercel.com/docs/domains/set-up-custom-domain).

## 3. Configure Cloudflare DNS

Add the domain to the destination service before creating each DNS record. This lets that service display the exact current target and ownership requirements.

### Web record

1. Add `relay.zerotools.online` to the Vercel project's **Domains** page.
2. In Cloudflare DNS, create the CNAME record Vercel requests for host `relay`.
3. Use **DNS only** while Vercel verifies the domain and provisions its certificate.
4. Confirm Vercel reports **Valid Configuration** and `https://relay.zerotools.online` serves the production deployment.

Do not copy a CNAME target from an old guide. Use the value shown by the project's domain inspection because Vercel can assign project-specific targets.

### API record

1. Create an `A` record for host `api` pointing to the VM's public IPv4 address.
2. Start with **DNS only** so Caddy can obtain and renew the origin certificate through ports 80 and 443.
3. Verify `https://api.zerotools.online/api/v1/health` directly.
4. Optionally enable the Cloudflare proxy after direct HTTPS succeeds. Set Cloudflare SSL/TLS mode to **Full (strict)** so Cloudflare validates Caddy's origin certificate.

Keep ports 80 and 443 open to Caddy. Restrict SSH to administrator/runner source addresses where practical. If the Cloudflare proxy is enabled permanently, use Cloudflare-origin firewall controls or a tunnel as a later hardening step; do not expose the API container port directly.

## 4. Bootstrap the VM once

Use a supported Linux distribution and install Docker Engine and the Compose plugin from Docker's official repository. Do not rely on an unmaintained distribution package. Follow Docker's current [Engine installation guide](https://docs.docker.com/engine/install/).

The VM must meet this baseline:

| Requirement       | Production configuration                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Architecture      | `linux/amd64`; the workflow currently publishes an AMD64 image                                               |
| Runtime           | Docker Engine running at boot, the `docker compose` plugin, and GNU `timeout`                                |
| Storage           | At least 1 GiB free in Docker's data-root before each release                                                |
| Deploy account    | Non-root user with the dedicated Actions public key in `authorized_keys` and permission to run Docker        |
| Deploy directory  | `/opt/relay` or the exact `VM_DEPLOY_PATH`, owned by the deploy user with mode `0750`                        |
| Inbound firewall  | SSH TCP on `VM_PORT`, TCP 80/443, and UDP 443; never expose API port 4000                                    |
| Outbound firewall | HTTPS to GHCR and external APIs plus the managed PostgreSQL and Redis endpoints                              |
| DNS and TLS       | `api.zerotools.online` points to the VM; use DNS-only until Caddy obtains TLS, then Cloudflare Full (strict) |
| Persistent state  | Preserve and back up the Caddy data/config named volumes                                                     |
| Registry access   | Deploy user logged into `ghcr.io` with a dedicated classic PAT limited to `read:packages`                    |

Create a non-root deploy user and directory. The examples assume `/opt/relay`:

```bash
sudo install -d -m 0750 -o <deploy-user> -g <deploy-user> /opt/relay
```

The deploy user needs permission to run Docker and write to `/opt/relay`. Treat Docker permission as root-equivalent. Do not create the runtime environment file manually: each deployment overwrites `/opt/relay/.env` from the protected GitHub `PROD_ENV_FILE` secret and sets its mode to `0600`.

Authenticate the VM to GHCR once with a dedicated GitHub personal access token (classic) limited to `read:packages`:

```bash
docker login ghcr.io --username <github-user>
```

Enter the token only at Docker's password prompt. Do not put the token in `.env.prod`, `PROD_ENV_FILE`, Compose, the repository, or the deployment workflow. GitHub documents the required scope in [Working with the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

The Compose project stores Caddy certificate state in named volumes. Include those volumes in VM backups; do not delete them during an ordinary deployment.

## 5. Configure GitHub Actions deployment

Create a protected GitHub Actions environment named `production`. Require approval if production calls or paid-provider traffic should not start automatically.

Add these exact GitHub Actions secrets to that environment:

| Secret               | Value                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `PROD_ENV_FILE`      | Complete multiline contents of the reviewed local `.env.prod` file |
| `VM_HOST`            | VM hostname or public IP used by SSH                               |
| `VM_PORT`            | SSH port, normally `22`                                            |
| `VM_USER`            | Non-root deploy user                                               |
| `VM_SSH_PRIVATE_KEY` | Private key dedicated to GitHub Actions deployment                 |
| `VM_SSH_KNOWN_HOSTS` | Verified `known_hosts` line for the VM                             |
| `VM_DEPLOY_PATH`     | Absolute VM directory, normally `/opt/relay`                       |

`PROD_ENV_FILE` is one multiline secret, not 32 separate GitHub secrets. Paste the exact contents of `.env.prod` in **Settings -> Environments -> production -> Environment secrets**, or set it without printing the file:

```bash
gh secret set PROD_ENV_FILE --env production < .env.prod
```

Every deployment materializes that secret only in the runner's temporary directory, copies it over SSH directly to `VM_DEPLOY_PATH/.env`, replaces the prior file, applies mode `0600`, and removes the runner copy. Updating `PROD_ENV_FILE` takes effect on the next VM deployment. An image rollback continues to use the current `.env`; to revert configuration as well, first restore the intended `PROD_ENV_FILE` value and deploy again.

Generate `VM_SSH_KNOWN_HOSTS` from a trusted administrator machine, then compare the fingerprint with the VM console or hosting control panel before saving it. Do not accept an unknown host key inside the workflow.

The workflow uses the repository-scoped `GITHUB_TOKEN` with `packages: write` to publish the image; no GHCR write token is needed as a GitHub secret. The VM's one-time `read:packages` login is separate.

The automatic deployment runs only after the `Quality` workflow succeeds for `main`. `workflow_dispatch` remains available for an explicitly approved manual release; the operator must verify that the selected SHA has passed `pnpm check` before using it.

On an eligible release, the workflow:

1. checks out the exact commit;
2. builds the pinned production Docker image;
3. publishes immutable Git-SHA and moving `main` tags to GHCR;
4. materializes `PROD_ENV_FILE` without logging it;
5. copies the production Compose and Caddy files and overwrites `VM_DEPLOY_PATH/.env` over SSH;
6. sets `.env` to mode `0600` and tells Compose to use it;
7. removes only stale Relay runtime images while retaining the active and previous releases;
8. verifies at least 1 GiB is free in Docker's data-root;
9. pulls the immutable SHA image with three bounded attempts and quiet progress output;
10. replaces the API and worker, preserves the Caddy volumes, and waits for all container health checks;
11. records the prior release configuration and reports startup logs automatically if health checks fail.

If the replacement fails its Compose health checks, the workflow retains the prior release reference and attempts to restore that image using the newly uploaded `.env`. Because the workflow overwrites `.env` on every deployment, configuration is not rolled back automatically. Treat the workflow as failed until the operator verifies the service and restores `PROD_ENV_FILE` if configuration caused the failure.

The activation connection uses SSH keepalives. Each registry pull is limited to ten minutes and retried up to three times with backoff, while the deployment job has enough time for those retries plus health-check rollback. Before pulling, the deployment removes old images only from the Relay runtime repository and prunes dangling images carrying this repository's OCI source label; it never runs a host-wide `docker system prune` and never removes Caddy volumes. If storage remains below the minimum, the job fails before changing containers and prints Docker storage diagnostics.

Vercel deploys the same `main` commit independently. Confirm both Vercel and VM deployments before treating a release as complete.

The workflow deliberately does not require the public hostname during the first infrastructure deployment because DNS may not exist yet. After `api.zerotools.online` is configured, the public health request in the verification section is the required Caddy, certificate, DNS, and optional Cloudflare integration check.

## 6. Initialize the empty production database

Relay intentionally has no Prisma migrations directory and does not run migration commands. The production release process uses reviewed schema push against a backed-up database.

For the first release:

1. Provision a new, empty PostgreSQL 18 database.
2. Verify TLS, automated backups, and a tested restore path.
3. Review `packages/database/prisma/schema.prisma` and the target connection string.
4. On a trusted administrator workstation, check out the exact release SHA, install the frozen workspace, and generate Prisma Client.
5. Keep `.env.prod` at the repository root with mode `0600`, review the target URL one final time, and apply the schema with Node's environment-file loader:

   ```bash
   corepack pnpm install --frozen-lockfile
   corepack pnpm db:generate
   node --env-file=.env.prod ./node_modules/turbo/bin/turbo run db:push --filter=@relay/database
   ```

6. Deploy the immutable runtime image to the VM and run the health checks below.

The production runtime image is intentionally minimal and does not carry the Prisma CLI or repository source. Schema administration happens from the reviewed release checkout, not from a long-running API or worker container.

Do not run `pnpm db:reset` or `pnpm db:seed` against production. `db:reset` deletes data. For every later schema change, take and verify a fresh backup, drain the worker when needed, review the Prisma diff, run `db:push` as a separately approved maintenance action, and verify a restore rehearsal before promotion.

## 7. Configure ElevenLabs after the API is public

Follow the checked-in [ElevenLabs agent contract](../development/elevenlabs-agent.md). Configure only these signed events:

- `post_call_transcription`
- `call_initiation_failure`

Send both to:

```text
https://api.zerotools.online/api/v1/webhooks/elevenlabs
```

Do not enable `post_call_audio`. It sends a large base64 body and is unnecessary because Relay retrieves consented audio from the authenticated conversation API after the transcription event. ElevenLabs requires a successful webhook endpoint to return HTTP 200; repeatedly failing endpoints can be disabled.

## 8. Release and integration verification

Run the credential-free repository gate before deployment:

```bash
pnpm check
```

After deployment, verify one boundary at a time in this order. Stop at the first failure instead of exercising downstream paid services with an unhealthy dependency.

| Order | Check              | Passing evidence                                                                                  |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------- |
| 1     | API and TLS        | Health endpoint returns HTTP 200 with the intended `APP_VERSION`                                  |
| 2     | PostgreSQL 18      | API can read/write a disposable owned draft; managed dashboard shows the connection               |
| 3     | Redis/BullMQ       | API enqueues and worker consumes a controlled job without retry churn                             |
| 4     | Clerk              | Production sign-in succeeds and an unauthenticated protected API request returns 401              |
| 5     | Google Places      | One restricted moving-business search returns normalized callable candidates                      |
| 6     | Supabase           | One private object can be stored; owner receives a short-lived signed URL; anonymous access fails |
| 7     | OpenAI             | One non-sensitive fixture transcript produces schema-valid extraction with the pinned model       |
| 8     | ElevenLabs webhook | Valid signed fixture returns 200 once; invalid signature is rejected; duplicate is idempotent     |
| 9     | Voice intake       | One consented interview binds to the correct owned draft and produces reviewable facts            |
| 10    | Outbound call      | One approved destination completes disclosure, transcript, quote/outcome, evidence, and ranking   |

Use test data and provider allowlists until the final step. Verify country permissions, phone-number ownership, recording law, user consent, provider quotas, and spend caps before any real call.

Useful public checks:

```bash
curl --fail --silent --show-error https://api.zerotools.online/api/v1/health
curl --fail --silent --show-error https://relay.zerotools.online
```

The API health endpoint proves process liveness and version only. Database, Redis, worker, and external provider checks remain explicit release evidence.

## Rollback

Every runtime image is tagged with its source Git SHA. To roll back the API and worker:

1. Identify the last known-good SHA from the prior successful deployment.
2. Confirm that its Prisma schema remains compatible with the current production database. Application rollback does not reverse `db:push`.
3. In `VM_DEPLOY_PATH`, set the Compose image reference to the known-good immutable tag and redeploy:

   ```bash
   RELAY_IMAGE=ghcr.io/<owner>/relay-runtime:<known-good-sha> \
     RELAY_ENV_FILE=.env \
     docker compose --env-file .release.env -f compose.yaml pull
   RELAY_IMAGE=ghcr.io/<owner>/relay-runtime:<known-good-sha> \
     RELAY_ENV_FILE=.env \
     docker compose --env-file .release.env -f compose.yaml up -d --remove-orphans
   ```

4. Verify API health, worker logs, queue depth, and one authenticated read.
5. In Vercel, promote the matching known-good deployment or redeploy its Git SHA.

Do not delete images, `.env`, database data, Redis state, or Caddy volumes during rollback. If the database schema is not backward-compatible, stop and restore through the separately tested database recovery procedure instead of guessing.

## Production security checklist

- Keep the VM `.env` mode `0600`, outside Git, and sourced only from the protected `PROD_ENV_FILE` environment secret.
- Keep the API container private behind Caddy; expose only ports 80 and 443.
- Use exact CORS origins and Cloudflare Full (strict) TLS.
- Use a dedicated SSH key, verified host key, protected GitHub environment, and least-privilege GHCR token.
- Keep PostgreSQL and Redis off the public internet or restrict them to the VM with TLS and provider access controls.
- Keep the Supabase bucket private and the service-role key out of the web bundle.
- Restrict Google, OpenAI, ElevenLabs, and Twilio quotas, destinations, and spending independently of application checks.
- Keep separate production and preview provider assets.
- Monitor API health, container restarts, worker failures/retries, Redis queue depth, webhook signature failures, PostgreSQL capacity, provider errors, and certificate expiry.
- Rotate any credential exposed in Git history, workflow logs, screenshots, support tickets, or task output.
