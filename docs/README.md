# Project documentation

Status: Canonical index  
Owner: Project team  
Last reviewed: 2026-07-19

This directory separates current decisions from the unchanged planning files that seeded the project.

## Canonical documentation

### Product

- [Overview](product/overview.md) - vision, users, scope, value, and final identity.
- [Requirements](product/requirements.md) - numbered functional and non-functional requirements.
- [User journeys](product/user-journeys.md) - customer and system flows.
- [Roadmap](product/roadmap.md) - MVP, stretch work, and expansion.

### Challenge

- [Challenge requirements](challenge/requirements.md) - faithful implementation-oriented distillation.
- [Acceptance criteria](challenge/acceptance-criteria.md) - evidence required for a complete submission.
- [Demo script](challenge/demo-script.md) - three-to-four-minute presentation plan.

### Architecture

- [System overview](architecture/overview.md)
- [Repository layout](architecture/repository-layout.md)
- [Core workflows](architecture/workflows.md)
- [Data model](architecture/data-model.md)
- [Integrations](architecture/integrations.md)
- [Security and privacy](architecture/security-privacy.md)
- [Reliability and observability](architecture/reliability-observability.md)
- [Architecture decisions](architecture/decisions/README.md)

### Design

- [Brand and experience direction](design/brand.md)
- [Design tokens](design/tokens.md)
- [UI architecture and user flows](design/ui-architecture.md)

### Development and operations

- [Getting started](development/getting-started.md)
- [Environment variables](development/environment.md)
- [Service and API setup](development/service-setup.md)
- [Engineering conventions](development/conventions.md)
- [Testing strategy](development/testing.md)
- [Deployment shape](operations/deployment.md)
- [Operational runbook](operations/runbook.md)

### Delivery

- [Project task list](project/task-list.md)
- [Risks and open decisions](project/risks-and-decisions.md)

## Source references

The [references index](references/README.md) lists the original PRD, brand notes, and challenge brief. These files are preserved for traceability but are not edited as the canonical project documentation evolves.

## Document lifecycle

Each canonical document identifies its status, owner, and review date. If a canonical document conflicts with an original reference, record the discrepancy in [risks and open decisions](project/risks-and-decisions.md) and resolve it through an architecture or product decision before implementation.
