# Relay hackathon submission

## Short description

AI purchasing agent that calls service providers, negotiates comparable offers, exposes every fee, and recommends the strongest verified deal with evidence.

## 1. Problem & Challenge

Buying phone-quoted services is frustrating and inefficient. Customers repeatedly explain the same requirements, receive quotes with inconsistent scopes, and struggle to identify hidden fees or compare offers fairly. Existing marketplaces help users find businesses, but they rarely handle the calls, negotiations, and detailed comparison.

## 2. Target Audience

Relay is designed for busy consumers and small businesses purchasing high-friction, phone-quoted services. The initial target is people planning a move who want to save time, avoid surprise charges, and confidently choose a provider.

## 3. Solution & Core Features

Relay converts the user's requirements into one confirmed purchasing brief. It discovers eligible businesses, gets the user's approval, and calls multiple providers using the same scope.

Relay then:

- Collects and negotiates quotes in parallel
- Itemizes prices, fees, exclusions, and unknowns
- Uses only truthful competing offers as leverage
- Links important claims to call evidence
- Produces an evidence-backed recommendation
- Keeps the final booking decision with the user

## 4. Unique Selling Proposition (USP)

Relay is not another directory or quote-request form. It actively calls and negotiates with providers on the customer's behalf. Every provider receives the same fixed requirements, every fee remains visible, and recommendations are supported by evidence. Relay never fabricates competing bids and never books automatically.

## 5. Implementation & Technology

Relay is implemented as a TypeScript monorepo using Nuxt 4 and Vue 3 for the frontend, NestJS for the API and background workers, Prisma with PostgreSQL for persisted data, and BullMQ with Redis for durable jobs.

ElevenLabs and Twilio support disclosed AI phone conversations, OpenAI Structured Outputs extract normalized information from conversations, Google Places supports business discovery, Supabase provides private evidence storage, and Clerk handles authentication. A deterministic fixture mode makes the complete workflow reproducible for demonstrations and testing.

## 6. Results & Impact

Relay now supports a complete persisted workflow from brief confirmation to business selection, parallel calls, negotiation tracking, and a final evidence-backed report.

In the demonstration scenario, Relay completes three provider calls and recommends a verified offer of **$1,840**, reduced from **$2,210**—a demonstrated saving of **$370**. More importantly, it gives users a transparent comparison of prices, conditions, fees, and supporting evidence while reducing hours of repetitive work.

## What was your most fun moment during the hackathon?

The most enjoyable moment was seeing the first complete run come together: three businesses receiving the same brief, quotes arriving with different conditions, one provider improving its offer, and Relay turning everything into a clear recommendation with supporting evidence. That was when the project stopped feeling like separate features and started feeling like a real purchasing agent.

## Additional Information

Relay was designed and built by one person, covering customer research, product decisions, interface design, backend architecture, integrations, and demonstration materials.

The repository defaults to a deterministic demonstration mode so judges can reproduce the complete experience without making paid external calls. The same architecture also supports live provider discovery and real disclosed AI phone conversations.
