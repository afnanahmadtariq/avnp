# Engineering conventions

Status: Canonical  
Owner: Engineering  
Last reviewed: 2026-07-19

## TypeScript and modules

- Use strict TypeScript, explicit public return types where they clarify contracts, and `noUncheckedIndexedAccess`.
- Use ESM and package exports. Follow NodeNext's explicit `.js` relative-import convention in built Node applications.
- Validate external values with Zod at boundaries; inferred types follow schemas.
- Avoid `any`; use `unknown` plus validation for provider and webhook data.
- Represent money as integer minor units plus currency.

## Naming

- Workspace names use the final `@relay/*` scope.
- Schemas use a lower-camel name ending in `Schema`; inferred types use the corresponding PascalCase name.
- Queue and event names are namespaced constants, not repeated string literals.
- Identifiers end with `Id`; provider-owned identifiers make the provider explicit when ambiguity exists.

## Application boundaries

- Controllers validate and delegate; they do not contain domain policy.
- Queue processors live in the worker, not the API or queue package.
- Domain functions do not read environment variables, clocks, random values, databases, or provider SDKs directly.
- Provider adapters translate to and from contracts and classify errors.
- Browser code imports only browser-safe workspaces.

## Errors and logs

Errors carry a stable code, safe message, retry classification, and causal detail for internal handling. User-facing responses never expose stacks, secrets, provider payloads, transcripts, or personal data. Structured logs carry correlation IDs and status metadata rather than raw content.

## Change discipline

Update tests and canonical docs with implementation. Record architectural tradeoffs in ADRs. Keep generated files out of hand edits. Avoid mixing broad formatting or unrelated refactors into feature changes.
