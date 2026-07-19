# Local development

Status: Canonical  
Owner: Engineering  
Last reviewed: 2026-07-19

## Prerequisites

- Node.js 24.18.0, pinned by `.nvmrc` and `.node-version`.
- Corepack and pnpm 11.15.0, pinned in the root manifest.
- Docker Desktop or compatible Docker engine only for local PostgreSQL 18.4 and Redis.

## First setup

Activate the exact Node.js version from `.nvmrc` or `.node-version`, then run:

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
```

The scaffold's build and tests do not require live provider values. Empty provider variables are expected until their adapters are enabled.

Before creating any paid provider account, read [Service and API setup](service-setup.md). The provider names in `.env.example` are reserved placeholders and are not consumed by the current deterministic application.

## Run applications

```bash
pnpm dev
```

Or run one application:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

Default endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Health: `http://localhost:4000/api/v1/health`

## Optional infrastructure

```bash
docker compose -f infra/compose.yaml up -d
```

This starts PostgreSQL 18.4 on port 5432 and Redis on port 6379 using local-only development credentials from `.env.example`. PostgreSQL 18 stores its versioned data directory beneath `/var/lib/postgresql`, which is the named-volume mount used by the Compose service. Local database data is disposable; older local database directories are deliberately unsupported.

## Quality gate

```bash
pnpm check
```

Run individual stages while iterating: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Common setup problems

- If Node.js reports the wrong version, select `24.18.0` with your version manager before installing.
- If pnpm reports the wrong version, run `corepack prepare pnpm@11.15.0 --activate`.
- If a workspace import is missing, run `pnpm install` from the repository root; do not install from an application directory.
- If Prisma types are missing, run `pnpm db:generate`.
- If ports 3000 or 4000 are occupied, stop the conflicting process before using the default root development command.
- If PostgreSQL or Redis is unavailable, keep using the credential-free scaffold path unless the feature under development requires persistence or queues.
