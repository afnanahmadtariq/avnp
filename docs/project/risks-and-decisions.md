# Risks and open decisions

Status: Active  
Owner: Project lead  
Last reviewed: 2026-07-19

| Topic                           | Current position                                                                                                                   | Next review trigger                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Product name                    | Relay is final across product copy, assets, and the `@relay/*` scope.                                                              | Revisit only by explicit owner decision.                                        |
| Runtime modes                   | Fixture mode remains deterministic and credential-free; live mode composes the implemented provider stack.                         | Any contract divergence between modes.                                          |
| Call lifecycle ownership        | ElevenLabs owns the agent and native Twilio call lifecycle; Relay ingests signed events and orchestrates state.                    | First consented real-call smoke test.                                           |
| Active call cancellation        | Optional Twilio server credentials terminate the underlying active native call; without them Relay still records cancellation.     | Operational cancellation test.                                                  |
| Authentication                  | Clerk is the selected and implemented live identity provider; local identity remains fixture-only.                                 | Real-key multi-user authorization test.                                         |
| Object storage                  | Private Supabase Storage is selected; its adapter supports signed access and retention metadata.                                   | Ownership-checked delivery route plus real upload/download/deletion smoke test. |
| Discovery provider              | Google Places API (New) is the only live directory; deterministic fixtures remain the local path.                                  | Quota, terms, and candidate-quality review.                                     |
| Extraction provider             | OpenAI Responses handles document/interview/quote extraction with strict structured output.                                        | Golden-document and golden-transcript evaluation.                               |
| Recording law and AI disclosure | Jurisdiction, consent, disclosure, retention, and calling rules remain launch blockers even though product states are implemented. | Before any live public calling.                                                 |
| Deployment                      | Nuxt/Nitro web plus persistent NestJS API/worker and managed PostgreSQL 18, Redis, and private storage.                            | Preview environment and backup/restore test.                                    |

## Highest implementation risks

- A polished demo that hides non-comparable quotes.
- Provider callbacks duplicated or delivered out of order.
- API and worker both believing they own call lifecycle.
- Retrying a billable request after an ambiguous timeout.
- Secrets or personal data entering browser bundles, queues, fixtures, or logs.
- Incomplete specification versions being mixed within one comparison.
- Model-generated leverage that is not backed by a compatible real quote.
- Venue connectivity and live-business availability during the demo.
- A deployed Nuxt build pointing at the wrong API origin.
- Provider credentials, quotas, destination permissions, or webhook routing differing from fixture assumptions.

Remaining launch risks require an owner, mitigation, credentialed test/evidence, and review date before the corresponding live capability is enabled.
