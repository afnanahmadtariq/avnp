# Risks and open decisions

Status: Active  
Owner: Project lead  
Last reviewed: 2026-07-19

| Topic                           | Current position                                                                          | Decision trigger                           |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| Product name                    | Relay is final across product copy, assets, and the `@relay/*` scope.                     | Revisit only by explicit owner decision.   |
| Live counterparty setup         | Support real, role-played, and counter-agent adapters; deterministic mode is mandatory.   | First complete demo rehearsal.             |
| ElevenLabs vs Twilio ownership  | Keep ports separate until a verified live-call path proves one lifecycle owner.           | First end-to-end call.                     |
| Authentication                  | Clerk is planned but the foundation is credential-free.                                   | First multi-user persisted flow.           |
| Object storage                  | Supabase/S3-compatible adapter; no final vendor lock.                                     | First uploaded document/recording.         |
| Discovery provider              | Google Places primary, Yelp optional, fixtures default.                                   | Quota, terms, and data-quality evaluation. |
| OCR/model provider              | Adapter boundary only; compare extraction quality and cost.                               | Golden-document evaluation.                |
| Recording law and AI disclosure | Treat jurisdiction, consent, disclosure, retention, and calling rules as launch blockers. | Before any live public calling.            |
| Deployment                      | Nuxt/Nitro web output; API/worker on persistent services.                                 | Preview environment setup.                 |

## Highest implementation risks

- A polished demo that hides non-comparable quotes.
- Provider callbacks duplicated or delivered out of order.
- API and worker both believing they own call lifecycle.
- Retrying a billable request after an ambiguous timeout.
- Secrets or personal data entering browser bundles, queues, fixtures, or logs.
- Incomplete specification versions being mixed within one comparison.
- Model-generated leverage that is not backed by a compatible real quote.
- Venue connectivity and live-business availability during the demo.

Each risk should acquire an owner, mitigation, test/evidence, and review date when its implementation task moves into progress.
