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
- **Web/UI:** server-render smoke checks, accessibility of state/status components, and later browser tests for the critical journey.
- **Providers:** recorded/constructed fixtures at adapter boundaries; live tests run separately and never in default CI.

## Voice evaluation set

Golden calls should cover a cooperative dispatcher, interruption-heavy dispatcher, lowball quote with hidden fees, hard-sell upseller, refusal to quote, callback promise, and “are you a robot?” question. Evaluate fee recall, structured ending, disclosure, hallucinated facts, compatible leverage, latency, and transcript quality.

## Determinism

Default tests use fixed IDs, clocks, money, and provider fixtures. No test places a phone call, spends provider credits, or requires public network access. Integration tests may use ephemeral PostgreSQL/Redis in CI when that phase begins.

## Quality commands

`pnpm test` runs workspace unit/integration tests. `pnpm check` also verifies format, lint, types, and builds. End-to-end and live-provider suites will have separate explicit commands because they need infrastructure, credentials, or cost approval.
