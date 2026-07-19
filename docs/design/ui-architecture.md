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

### Public and authentication

| Route         | Screen         | Primary job                                     |
| ------------- | -------------- | ----------------------------------------------- |
| `/`           | Product home   | Understand Relay and begin a request            |
| `/sign-in/**` | Sign in        | Authenticate and return to the requested screen |
| `/sign-up/**` | Create account | Create an account and continue to profile setup |

### Product

| Route                      | Screen               | Primary job                                                                 |
| -------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `/start`                   | Guided intake        | Create a structured draft after authentication                              |
| `/dashboard`               | Requests dashboard   | See active and completed requests, savings, and next actions                |
| `/requests/:id`            | Request resolver     | Resume an owned request at its correct next step                            |
| `/requests/:id/review`     | Brief review         | Edit and confirm the exact specification used for calls                     |
| `/requests/:id/businesses` | Business approval    | Approve eligible businesses before outbound calls                           |
| `/requests/:id/workspace`  | Live run             | Follow calls, quotes, evidence, and milestones                              |
| `/requests/:id/report`     | Final report         | Compare ranked offers, inspect evidence, and save the selected decision     |
| `/profile`                 | Profile              | Complete customer identity and optional contact details                     |
| `/account/**`              | Sign-in and security | Manage email, password, social accounts, profile photo, and active sessions |
| `/settings`                | Settings and privacy | Control notifications, calling consent, evidence retention, and data access |

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
- An interrupted upload or voice intake resumes at intake until its specification is complete.
- A stale or unknown request link returns to the owned request list instead of looping on retry.
- A partially successful discovery explains what is missing and provides a retry or brief-correction path.
- A callback remains visible with an expected follow-up time.
- A declined or failed call remains visible in the run.
- Missing fees remain marked unresolved instead of displaying as zero.
- A suspicious low quote receives a visible risk warning and cannot silently become the winner.
- Failed and cancelled runs provide a start-over path.
- Settings make recording consent, truthful identity disclosure, evidence retention, and data access explicit.

## Account lifecycle

1. A new account returns from Clerk to `/profile?welcome=1`.
2. Relay imports the authoritative name and email from the authentication profile.
3. The customer adds a location and calling identity; a personal phone number remains optional.
4. The free plan is the only customer tier exposed in the current product.
5. Email, password, connected Google accounts, profile photo, and sessions remain managed at `/account/**`.

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
