# Deployment shape

Status: Planned  
Owner: Engineering  
Last reviewed: 2026-07-19

## Environments

Use development, preview/staging, and production environments with separate databases, Redis instances, object storage, phone numbers, provider agents, auth tenants, and secrets. Never point preview branches at production calling credentials.

## Services

- **Web:** deploy the Nuxt/Nitro output to a compatible Node or edge platform.
- **API:** deploy as a persistent HTTP service capable of receiving provider webhooks.
- **Worker:** deploy as a separately scaled persistent process; do not place it in a request-only serverless runtime.
- **Data:** managed PostgreSQL 18, managed Redis, and private object storage with signed access.

## Release order

1. Apply backward-compatible database migrations.
2. Deploy contracts-compatible API and worker versions.
3. Deploy web after API readiness.
4. Run health, queue round-trip, and safe mock-adapter smoke checks.
5. Enable live providers only after webhook and consent verification.

Breaking event or database changes require an expand/migrate/contract sequence so in-flight calls and old workers remain safe.

## Configuration

Deployment secrets come from the platform secret manager. Public web variables contain no credentials. Version identifiers are exposed through health/telemetry. Turbo remote caching, when enabled, must exclude secrets and use trusted CI credentials.
