# Deployment shape

Status: Production delivery shape implemented; provisioning pending
Owner: Engineering  
Last reviewed: 2026-07-19

The executable Vercel, Cloudflare, GHCR, and VM procedure is in the [production deployment runbook](production-deployment.md). This page records the environment-independent release policy.

## Environments

Use development, preview/staging, and production environments with separate PostgreSQL databases, Redis instances, Supabase buckets, ElevenLabs agents, Twilio phone numbers, Clerk applications, OpenAI projects, Google keys, and secrets. Never point a preview branch at production calling credentials.

## Services

- **Web:** deploy the Nuxt/Nitro Node output. Verify its public API base points to the deployed API before promoting it.
- **API:** deploy as a persistent HTTPS service capable of receiving raw-body ElevenLabs webhooks at `/api/v1/webhooks/elevenlabs`.
- **Worker:** deploy as a separately scaled persistent process. It owns BullMQ consumers and long-running provider work and must not run in a request-only serverless function.
- **Data:** use managed PostgreSQL 18, managed Redis, and a private Supabase Storage bucket with backups, access controls, and retention settings.

After `pnpm build`, the workspace start commands are:

```bash
pnpm --filter @relay/web start
pnpm --filter @relay/api start
pnpm --filter @relay/worker start
```

The deployment platform supplies environment variables directly; production processes do not depend on a committed `.env` file.

## Database policy

Relay intentionally uses Prisma schema push/reset only and has no migrations directory or migration commands.

- Run `pnpm db:generate` during the build or release preparation.
- Before changing a managed database, verify a current backup and restore path, inspect the Prisma schema change, and run `pnpm db:push` against the intended target.
- Treat destructive or incompatible schema changes as a separately reviewed maintenance operation with drained workers and a tested restore plan.
- Never run `pnpm db:reset` against preview, staging, shared, or production data. It deletes existing data and is local-only.

## Release order

1. Provision managed PostgreSQL 18, Redis, and the private storage bucket; verify TLS, backups, connectivity, and retention.
2. Install all live server secrets from [the environment catalog](../development/environment.md), using exact web/API origins and no wildcard CORS.
3. Generate Prisma Client, review the schema impact, verify a backup, and apply `pnpm db:push` to the target database.
4. Deploy contracts-compatible API and worker versions with the same `APP_VERSION` and provider selectors.
5. Run API health, database access, Redis/BullMQ round-trip, fixture-adapter, and worker startup checks.
6. Deploy the web output only after API readiness and verify its public API base and Clerk instance.
7. Point ElevenLabs signed post-call events to `https://<api-host>/api/v1/webhooks/elevenlabs` and confirm invalid signatures are rejected.
8. Smoke-test Clerk, Google, OpenAI, Supabase, then one restricted and consented ElevenLabs/Twilio call before enabling broader traffic.

## Configuration and secrets

Deployment secrets come from the platform secret manager. Only the Clerk publishable key and ordinary public URL configuration enter the browser bundle. Database/Redis URLs, Clerk secret, Google key, ElevenLabs key/webhook secret, optional Twilio credentials, OpenAI key, and Supabase service-role key remain server-only.

Version identifiers are exposed through health/telemetry. Turbo remote caching, when enabled, must exclude secrets and use trusted CI credentials. Rotate any value that appears in source control, build output, logs, screenshots, or task output.

## Promotion gate still pending

No real credentials or public deployment endpoints are stored in the repository. Production promotion remains blocked on managed-service provisioning, external credential smoke tests, backup/restore verification, monitoring/alerting, legal approval for recording and automated calling, and one reviewed end-to-end live run.
