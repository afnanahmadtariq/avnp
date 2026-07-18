# ADR-0003: Keep vertical behavior in configuration

Status: Accepted  
Date: 2026-07-19

## Context

Moving is the MVP, but the challenge expects a system that can later serve other phone-priced markets. Hard-coding moving questions, fees, benchmarks, and negotiation tactics into agents would make every expansion a rewrite.

## Decision

Represent job fields, estimator questions, fee taxonomy, benchmarks, red-flag rules, and allowed negotiation levers as validated vertical configuration. Core orchestration consumes the configuration through stable contracts.

## Consequences

- The moving configuration can be tested independently.
- Core domain policy stays provider- and market-independent.
- Configuration changes require versions so reports remain reproducible.
- A future authoring UI is possible but is not part of the hackathon MVP.
