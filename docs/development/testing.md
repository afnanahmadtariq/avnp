# Testing strategy

Status: Canonical foundation  
Owner: Engineering  
Last reviewed: 2026-07-19

## Default test layers

- **Contracts:** valid and invalid schema examples, backward-compatible events, and JSON serialization.
- **Domain:** deterministic fee normalization, 30% outlier flags, ranking factors, truthful leverage, and incomplete quote handling.
- **Verticals:** moving questions, required fields, fee taxonomy, benchmark ranges, and configuration validation.
- **API:** isolated health/startup plus request validation, authentication, idempotent webhook, and enqueueing integration tests.
- **Worker:** bootstrap without credentials, job idempotency, retry classification, state transitions, and adapter contract tests.
- **Web/UI:** server-render smoke checks plus intake, dashboard, business approval, workspace, profile, and settings journey tests.
- **Providers:** recorded/constructed fixtures at adapter boundaries; live tests run separately and never in default CI.

## Voice evaluation set

Golden calls should cover a cooperative dispatcher, interruption-heavy dispatcher, lowball quote with hidden fees, hard-sell upseller, refusal to quote, callback promise, and “are you a robot?” question. Evaluate fee recall, structured ending, disclosure, hallucinated facts, compatible leverage, latency, and transcript quality.

## Determinism

Default tests use fixed IDs, clocks, money, and provider fixtures. No default test places a phone call, spends provider credits, or requires public network access. The BullMQ suite includes a conditional real Redis round-trip covering deduplication, retry, processing, shutdown, and cleanup when `QUEUE_PROVIDER=redis` and `REDIS_URL` are supplied.

## Quality commands

`pnpm test` runs the credential-free workspace unit/integration suites. `pnpm check` also verifies format, lint, types, and builds. Real Clerk, Google, ElevenLabs/Twilio, OpenAI, Supabase, public-webhook, and deployed end-to-end smoke tests remain explicit promotion steps because they need credentials, public infrastructure, user consent, or cost approval.
