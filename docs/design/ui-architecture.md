# Relay UI architecture

Status: Canonical  
Owner: Product and design  
Last reviewed: 2026-07-19

## Functionality map

Relay takes one service request from draft to an evidence-backed purchasing decision.

| Capability           | User outcome                                                                        | Product state               |
| -------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| Guided intake        | Describe the job once by guided form, voice, or document                            | Draft specification         |
| Specification review | Correct extracted facts and explicitly confirm the exact scope                      | Confirmed immutable version |
| Business discovery   | Review eligible businesses and approve who Relay may call                           | Approved call list          |
| Parallel calling     | Follow queued, dialing, live, callback, quoted, declined, or failed outcomes        | Negotiation run             |
| Quote normalization  | Compare the same fee taxonomy and see unresolved assumptions                        | Comparable quotes           |
| Negotiation evidence | Inspect truthful strategy, before/after terms, transcript, and recording references | Verified evidence           |
| Recommendation       | Understand best value, savings, confidence, and risk flags                          | Ranked report               |
| Account controls     | Maintain profile, contact preferences, consent, retention, and notifications        | User settings               |

Booking and payment are deliberately excluded from the MVP. Relay can save a decision, but it cannot purchase autonomously.

## Required UI inventory

### Public

| Route    | Screen        | Primary job                          |
| -------- | ------------- | ------------------------------------ |
| `/`      | Product home  | Understand Relay and begin a request |
| `/start` | Guided intake | Create a structured draft            |

### Product

| Route                           | Screen               | Primary job                                                                 |
| ------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `/dashboard`                    | Requests dashboard   | See active and completed requests, savings, and next actions                |
| `/requests/RLY-2048/review`     | Brief review         | Edit and confirm the exact specification used for calls                     |
| `/requests/RLY-2048/businesses` | Business approval    | Approve eligible businesses before outbound calls                           |
| `/workspace`                    | Live run             | Follow calls, quotes, evidence, and milestones                              |
| `/requests/RLY-2048/report`     | Final report         | Compare ranked offers and inspect the recommendation                        |
| `/profile`                      | Profile              | Maintain customer identity and default contact details                      |
| `/settings`                     | Settings and privacy | Control notifications, calling consent, evidence retention, and data access |

## Navigation model

The product shell has three stable groups:

1. **Workspace:** Dashboard and New request.
2. **Current request:** Brief, Businesses, Live calls, and Report.
3. **Account:** Profile and Settings.

Navigation labels describe destinations. Ordinal numbers, file-like labels such as “index,” decorative arrows, and duplicated section links are not navigation.

On compact screens, these groups collapse into a five-destination bottom bar: Dashboard, Brief, Live calls, Report, and Profile. New request remains the primary dashboard action; business approval stays inside the Brief flow; Settings remains reachable from Profile. This preserves the complete journey without a clipped or horizontally scrolling sidebar.

## Primary user flow

```text
Home
  → Start request
  → Choose input method and provide core facts
  → Review exact specification
  → Confirm version
  → Review and approve businesses
  → Start calls
  → Follow live negotiation
  → Inspect normalized quotes and evidence
  → Review final recommendation
  → Save decision
```

## Recovery flows

- A user correction creates a new specification version before more calls run.
- A callback remains visible with an expected follow-up time.
- A declined or failed call remains visible in the run.
- Missing fees remain marked unresolved instead of displaying as zero.
- A suspicious low quote receives a visible risk warning and cannot silently become the winner.
- Settings make recording consent, AI disclosure, evidence retention, and data access explicit.

## UX requirements

- One clear primary action per screen.
- Current lifecycle state and next action remain visible without reading raw logs.
- Evidence is linked at the point where a claim or recommendation is made.
- Dense operational detail is progressive: summary first, transcript and itemization on demand.
- Product navigation remains consistent across dashboard, request, report, profile, and settings.
- Motion communicates state changes only and respects reduced-motion preferences.
- Controls use text labels and accessible names; color never carries state alone.
- Mobile layouts preserve the complete flow without horizontal page scrolling.

## Visual direction

- Quiet warm-neutral canvas, white working surfaces, near-black text, restrained cobalt actions, and green only for verified success.
- Moderate type scale with a readable 60–72 character text measure.
- Borders separate real content regions; decorative stacked frames and unexplained lines are removed.
- The Relay SVG lockup and mark are the only rendered logo assets.
- Shadows are soft and reserved for elevated interactive surfaces.
