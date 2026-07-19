# Challenge requirements

Status: Canonical distillation  
Owner: Product  
Last reviewed: 2026-07-19

The authoritative source is the unchanged [challenge brief](../references/originals/challenge-brief.pdf). This document turns it into implementation identifiers without replacing the original wording.

| ID     | Required result                                                                                               | Implementation owner                  |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| CH-001 | A complete end-to-end voice-agent MVP for one phone-priced vertical.                                          | `apps/web`, `apps/api`, `apps/worker` |
| CH-002 | Voice interview built on ElevenLabs Agents.                                                                   | Integration adapter + intake workflow |
| CH-003 | At least one document type parsed into the same structured job specification.                                 | Document adapter + `@relay/contracts` |
| CH-004 | User confirms the specification before calls; the same version is reused for every call.                      | Web, API, persistence                 |
| CH-005 | At least three distinct live negotiation styles using real businesses, role-played humans, or counter-agents. | Worker + integrations                 |
| CH-006 | Every call produces an itemized comparable quote, callback commitment, or decline.                            | Contracts + worker                    |
| CH-007 | At least one price or term changes during a call because of gathered leverage.                                | Domain policy + evidence              |
| CH-008 | Competing quotes may be used; inventory and bids must never be fabricated.                                    | Domain constraints + evals            |
| CH-009 | The agent handles interruption, vague answers, refusal, and AI disclosure gracefully.                         | Conversation design + evals           |
| CH-010 | Quotes 30% or more below the comparable market are risk flags, not automatic winners.                         | Domain scoring                        |
| CH-011 | The final report ranks every quote and cites transcripts and recordings.                                      | Web + reporting workflow              |
| CH-012 | The demo plays calls and explains disclosure, friction handling, honesty, and structured endings.             | Demo script                           |
| CH-013 | Vertical fields, benchmarks, red flags, and levers are configuration rather than agent rewrites.              | `@relay/verticals`                    |

Price gathering, reporting, and negotiation are mandatory. A web form or scraped aggregator without real voice conversation does not satisfy the challenge.
