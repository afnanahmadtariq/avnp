# Project execution task list

Status: Core end-to-end implementation complete; external validation and hardening active
Owner: Project team  
Last reviewed: 2026-07-19

This checklist is the delivery source of truth for Relay. **Relay** is the final product and repository brand, and every canonical workspace uses the `@relay/*` package scope.

## Definition of done

An item is complete only when its implementation, tests, documentation, and environment notes are updated together. Root quality commands must remain green, fixtures and logs must contain no secrets or personal data, and failure states must be handled explicitly.

## Phase 0 - Repository baseline

- [x] Audit tracked and untracked repository content.
- [x] Review the PRD, visual direction, challenge brief, and logo drafts.
- [x] Finalize Relay as the single product, repository, and package-scope brand.
- [x] Create the production Relay SVG mark, lockup, palette, and usage guidance.
- [x] Select pnpm workspaces and Turborepo for orchestration.
- [x] Preserve and organize source documents and brand assets without changing their contents.
- [x] Publish the repository map and architecture decisions.

Acceptance criteria:

- Original source material remains available under `docs/references/` and `assets/brand/concepts/`.
- Canonical documents are clearly separated from source references.
- Canonical package naming and product identity use Relay consistently.

## Phase 1 - Monorepo foundation

- [x] Add the root package manifest, pnpm workspace definition, lockfile, and Turbo task graph.
- [x] Pin Node.js 24, pnpm, PostgreSQL 18.4, Redis 8.8.0, exact compatible dependency versions, container digests, and CI actions by immutable release SHA.
- [x] Add repository-wide ignore, formatting, editor, and environment templates.
- [x] Define `dev`, `build`, `lint`, `typecheck`, `test`, `format`, `format:check`, and `check` commands.
- [x] Configure cacheable build/test outputs and uncached persistent development tasks.

Acceptance criteria:

- A fresh `pnpm install` discovers every workspace.
- Root build, lint, typecheck, test, and format checks complete successfully.
- A repeated cacheable task reports Turbo cache hits.
- Generated files, credentials, and local runtime data are ignored.

## Phase 2 - Shared packages

- [x] Scaffold strict shared TypeScript and ESLint configurations.
- [x] Scaffold `@relay/contracts` for Zod schemas, DTOs, events, and queue payloads.
- [x] Scaffold `@relay/domain` for provider-independent quote normalization, scoring, and negotiation policy.
- [x] Scaffold `@relay/verticals` with moving-company intake fields, fee taxonomy, benchmarks, and red-flag rules as data.
- [x] Scaffold `@relay/database` as the sole owner of the Prisma schema and client.
- [x] Scaffold `@relay/queue` for typed queue names and job contracts.
- [x] Scaffold `@relay/integrations` for server-only provider ports and adapters.
- [x] Scaffold `@relay/ui` for browser-safe Relay tokens and framework-neutral styles.

Acceptance criteria:

- Every workspace has a unique name, explicit exports, and no circular dependency.
- Applications may import packages; packages never import applications.
- `web` can consume only browser-safe packages.
- Moving-specific behavior is configuration, not hard-coded orchestration logic.

## Phase 3 - Applications

- [x] Build `apps/web` with Nuxt file-based routing, Vue, TypeScript, and the complete Relay frontend.
- [x] Build the Relay marketing experience and interactive negotiation workspace with realistic local data.
- [x] Scaffold `apps/api` with NestJS, a versioned route prefix, validation, and `/api/v1/health`.
- [x] Scaffold `apps/worker` as a separate long-running process for call and quote orchestration.
- [x] Wire representative shared contracts into the web and API applications.
- [x] Provide credential-free development behavior for external integrations.

Frontend finalization:

- [x] Map customer capabilities, lifecycle states, trust boundaries, and recovery paths.
- [x] Map the required public, request, decision, profile, and settings interfaces.
- [x] Replace the section-index demo sidebar with stable product navigation and request context.
- [x] Implement the guided intake -> brief confirmation -> business approval -> live calls -> report flow.
- [x] Add the dashboard, profile, settings, evidence, consent, and retention surfaces.
- [x] Remove decorative ghost frames, unsupported categories, inert controls, and inconsistent glyphs.
- [x] Verify the complete UI at desktop and compact breakpoints with no page-level horizontal scrolling.

Acceptance criteria:

- Each application builds independently and through Turbo.
- The API health route returns a structured healthy response.
- The worker starts without initiating calls or requiring paid provider credentials.
- The web renders the product workflow and shared UI successfully.

## Phase 4 - Documentation and operations

- [x] Add a root quick start and a navigable documentation index.
- [x] Document product scope, requirements, user journey, success criteria, and roadmap.
- [x] Document system boundaries, data flow, data model, integration ownership, security, and reliability.
- [x] Add local development, environment, testing, deployment, and troubleshooting guides.
- [x] Add architecture decision records for pnpm/Turbo, runtime boundaries, and configuration-driven verticals.
- [x] Add private-team operating and security guidance.

Acceptance criteria:

- A new team member can understand the product and run the checked scaffold from the root README.
- Every environment variable has a purpose, owner, and safe local expectation; no value is documented as a secret.
- Challenge requirements can be traced to an application/package and planned evidence.

## Phase 5 - Quality and automation

- [x] Add unit tests for contracts, scoring, red flags, and vertical configuration.
- [x] Add an API health integration test and a web smoke test.
- [x] Add a conditional Redis/BullMQ round-trip test for deduplication, retries, processing, shutdown, and cleanup.
- [x] Add CI for frozen install, formatting, linting, typechecking, tests, and builds with current action releases pinned by immutable SHA.
- [x] Add dependency-boundary validation.

Acceptance criteria:

- Default checks require no paid credentials.
- Failures return non-zero exit codes and useful diagnostics.
- Critical challenge rules have deterministic test coverage.

## Phase 6 - Moving MVP vertical slice

- [x] Add immutable specification versions, consent-aware negotiation runs, ordered run events, recommendations, decisions, and a transactional outbox to Prisma.
- [x] Add API-facing Zod contracts for jobs, candidates, run snapshots/events/reports, decisions, profile, and settings.
- [x] Restrict queue payloads to identifiers and small execution parameters rather than embedded persistence records.
- [x] Add explicit Prisma push, deterministic seed, and opt-in reset commands without creating a migrations directory.
- [x] Build live ElevenLabs voice and OpenAI document intake into one confirmed structured job specification, with credential-free guided/document fixture intake.
- [x] Discover moving-company counterparties through Google Places API (New), normalize callable candidates, and require at least three unique selections.
- [x] Create at least three distinct negotiation strategies and execute the call queue with concurrency three.
- [x] Persist provider call states, transcripts, recordings, structured extraction evidence, quote outcomes, and explicit failure/no-evidence states.
- [x] Classify every non-quote completion as an explicit callback, decline, unavailable, no-answer, busy, or failed state.
- [x] Enforce that competing leverage references a real, evidenced quote from the same run and a different business.
- [x] Automatically schedule an evidenced follow-up round and demonstrate a real price improvement caused by truthful competing leverage.
- [x] Normalize and rank evidenced quotes, flag suspicious outliers, and cite transcript/recording evidence.
- [x] Present the live negotiation timeline, savings summary, evidence, decisions, and plain-language recommendation.

Acceptance criteria:

- The deterministic demo closes intake -> calls -> negotiation -> recommendation without external credentials.
- The live-provider path uses ElevenLabs voice agents and preserves the same contracts.
- The agent never invents inventory or competing bids and discloses that it is AI when asked.
- UI updates target under five seconds, at least three calls can progress concurrently, and transcript accuracy is measured toward 95%.

## Phase 7 - Production readiness and stretch work

- [x] Add Clerk authentication, consent capture, recording disclosure, retention controls, user ownership, account export, and audit logging.
- [x] Add ElevenLabs raw-body webhook verification, monotonic/idempotent processing, bounded provider timeouts, retry policies, and ambiguous-call replay protection.
- [x] Add live PostgreSQL, Redis/BullMQ, Supabase private-storage, Google Places, ElevenLabs/Twilio, and OpenAI provider compositions with startup validation.
- [x] Add pause/resume/cancel run controls and optional provider-side active Twilio call termination.
- [x] Add an ownership-checked API route that returns short-lived signed URLs for private Supabase evidence.
- [ ] Add an operator-visible human-handoff workflow.
- [ ] Provision preview/production services, observability/alerts, backup/restore checks, and deployment pipelines.
- [ ] Run real-credential smoke tests for Clerk, Google, ElevenLabs/Twilio, OpenAI, Supabase, Redis, the public webhook, and one consented end-to-end live run.
- [ ] Complete jurisdiction-specific legal/compliance approval before live public calling.
- [ ] Add multilingual calls, SMS/email follow-up, booking, history, and additional vertical configurations.

Acceptance criteria:

- Web, API, and worker deploy independently to suitable runtimes.
- Provider degradation cannot silently corrupt job, quote, or negotiation state.
- Personal data, recordings, and credentials follow documented access and retention policies.

## Current execution slice

The application now covers the persisted intake -> confirmation -> discovery -> approved calls -> structured outcomes -> truthful follow-up -> ranking -> private evidence -> timeline/report flow in fixture and implemented live-provider compositions. Remaining launch and stretch work is real-credential/public-webhook testing, managed deployment and observability, operator handoff, backup/restore evidence, legal approval, and post-MVP channels or verticals.
