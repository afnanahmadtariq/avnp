# ADR-0002: Separate web, API, and worker runtimes

Status: Accepted  
Date: 2026-07-19

## Context

Voice calls, callbacks, retries, and quote processing outlive browser and HTTP request lifetimes. Nuxt hosting, webhook ingress, and persistent BullMQ workers also have different scaling and deployment needs.

## Decision

Use three applications: Nuxt for the web experience, NestJS for fast HTTP/webhook/API work, and a separate Nest application context for long-running worker orchestration.

## Consequences

- The API enqueues work and returns; it does not run calls inline.
- The worker can deploy and scale separately from web traffic.
- Progress requires persisted events plus SSE or polling.
- Contracts, correlation, idempotency, and local multi-process development become first-class concerns.
