# Repository layout and dependency rules

Status: Canonical  
Owner: Engineering  
Last reviewed: 2026-07-19

## Workspaces

| Workspace             | Responsibility                          | May depend on                                               |
| --------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `@relay/web`          | Nuxt customer experience                | `@relay/ui`, `@relay/contracts`                             |
| `@relay/api`          | HTTP, validation, webhooks, enqueueing  | contracts, database, queue, integrations                    |
| `@relay/worker`       | Long-running orchestration              | contracts, domain, verticals, database, queue, integrations |
| `@relay/contracts`    | Zod schemas and transport types         | Zod only                                                    |
| `@relay/domain`       | Pure quote and negotiation policy       | contracts only                                              |
| `@relay/verticals`    | Market fields, fees, benchmarks, levers | contracts or domain types only                              |
| `@relay/database`     | Prisma schema/client                    | Prisma and contracts where mapping helps                    |
| `@relay/queue`        | Queue names and typed payloads          | contracts only                                              |
| `@relay/integrations` | Server-only provider ports/adapters     | contracts; vendor SDKs inside adapters                      |
| `@relay/ui`           | Browser-safe tokens and shared styles   | No application framework                                    |
| Tooling packages      | Shared compiler and lint configuration  | Tooling dependencies only                                   |

## Enforced direction

```text
apps  ->  packages
web   ->  ui + contracts
api   ->  contracts + database + queue + integrations
worker->  contracts + domain + verticals + database + queue + integrations

ui/domain/contracts/verticals  -X->  Nest, Prisma, provider SDKs, or apps
packages                       -X->  apps
```

## Boundary rules

- Contracts use runtime schemas and inferred types so validation and TypeScript cannot drift.
- Domain functions are deterministic and accept values, configuration, and explicit clocks/IDs rather than reading process state.
- Database models are persistence details; transport consumers receive contract-shaped DTOs.
- Integration interfaces are narrow capabilities such as `startCall`, `discoverBusinesses`, or `extractDocument`, not vendor response objects.
- Queue jobs contain identifiers and immutable versions, not large transcripts or provider secrets.
- UI components do not fetch, read environment variables, or import server modules.
- Applications compose packages and own framework-specific lifecycle behavior.

## Adding a workspace

Add a new workspace only when it has an independent responsibility, dependency boundary, or deployment lifecycle. Every workspace must have a unique `@relay/*` name, explicit exports, strict TypeScript configuration, lint/typecheck scripts, and tests for material behavior. Update this document and the root repository map in the same change.
