# Product overview

Status: Canonical  
Owner: Product  
Last reviewed: 2026-07-19

## Vision

People overpay for phone-priced services because comparison takes time, fee structures are inconsistent, and meaningful negotiation requires leverage. Relay becomes the customer's purchasing assistant: the customer explains the job once, and the system handles the repetitive market work.

> An AI purchasing agent that calls businesses, negotiates on the customer's behalf, compares every offer, and recommends the best verified deal.

## Brand identity

**Relay** is the final product and repository brand, and internal workspaces use the matching `@relay/*` package scope. The original challenge remains named **The Negotiator** in preserved source material. Relay describes handing off a difficult purchase and receiving each conversation, offer, and verified outcome in one place.

## Initial market

The MVP targets moving companies because the market is fragmented, prices for comparable work vary widely, hidden fees are common, and the challenge can be demonstrated with real or simulated phone conversations. Future markets include auto repair, contractors, wedding vendors, freight, equipment rental, and medical billing.

## Users

Primary users are homeowners, renters, and families arranging a move. Small businesses and anyone purchasing services primarily quoted by phone are secondary users.

## Customer promise

The customer spends minutes creating and confirming one complete job specification. Relay then:

1. Finds suitable businesses.
2. Calls at least three counterparties with identical facts.
3. Extracts itemized and comparable quotes.
4. Uses truthful market leverage to negotiate price or terms.
5. Detects hidden fees, missing details, and suspicious outliers.
6. Ranks every result and explains the recommendation with evidence.

## Product principles

- **One source of truth:** voice and document intake produce the same confirmed job schema.
- **Comparable by design:** every business receives the same specification and every quote uses the same fee taxonomy.
- **Evidence before confidence:** recommendations cite transcripts, recordings, and itemized terms.
- **Honesty is a hard constraint:** no fake bids, invented inventory, or misrepresentation.
- **Voice is the mechanism:** the product must conduct real voice conversations rather than scrape quote forms.
- **Configuration over forks:** vertical fields, benchmarks, red flags, and negotiation levers live in configuration.
- **Human control:** the customer confirms the job before calls and can inspect why a recommendation was made.

## MVP boundary

In scope:

- Moving-company voice and document intake.
- User review and confirmation.
- Programmatic or fixture-based business discovery.
- Three or more real, role-played, or counter-agent calls.
- Structured quote extraction and at least one improved offer or term.
- Ranked comparison with transcripts and recording references.
- A credential-free deterministic demo path alongside provider adapters.

Not in the first slice:

- Booking, payment, or contract execution.
- Autonomous purchasing without confirmation.
- A generic multi-vertical authoring interface.
- Unsupervised claims about legal compliance in every calling jurisdiction.
- Production-scale CRM, recurring procurement, or learned negotiation policy.
