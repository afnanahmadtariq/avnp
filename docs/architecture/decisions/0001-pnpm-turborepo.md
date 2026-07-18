# ADR-0001: Use pnpm workspaces and Turborepo

Status: Accepted  
Date: 2026-07-19

## Context

The project needs multiple TypeScript applications, reusable packages, one dependency graph, fast parallel checks, and a reproducible hackathon workflow. The repository began without package tooling or source code.

## Decision

Use pnpm workspaces for dependency management and the `workspace:*` protocol for internal packages. Use a repository-pinned Turborepo version to orchestrate build, lint, typecheck, test, and persistent development tasks.

## Consequences

- One lockfile and one root quality gate cover every workspace.
- Package boundaries are visible in the dependency graph.
- Build and test outputs can be cached locally and later remotely.
- Team members need the pinned pnpm version; Corepack is the recommended path.
- Turbo configuration must declare outputs, dependencies, persistence, and environment inputs correctly.
