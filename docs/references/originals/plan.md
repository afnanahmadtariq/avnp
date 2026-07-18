# PRD — The Negotiator

### AI Voice Negotiation Platform

**Version:** 1.0 (Hackathon MVP)
**Duration:** 48-72 Hours
**Goal:** Build an AI agent that interviews a user, calls multiple businesses, negotiates prices, compares quotes, and recommends the best deal with evidence.

---

# 1. Vision

People overpay because comparing phone-only services is slow and frustrating.

Our AI becomes the customer's personal purchasing assistant.

Instead of spending two hours calling businesses, the user spends three minutes talking to the AI.

The AI does the rest.

---

# Elevator Pitch

> "An AI purchasing agent that calls businesses, negotiates prices on your behalf, compares every offer, and recommends the best deal."

---

# Problem

Suppose someone wants to hire movers.

Current process

* Search Google
* Call 7 companies
* Explain inventory seven times
* Write prices manually
* Compare hidden fees
* Negotiate
* Hope for the best

Nobody actually does this.

Therefore people overpay.

---

# Solution

User talks once.

AI

✓ understands the job

✓ creates structured specification

✓ calls businesses

✓ negotiates

✓ compares offers

✓ highlights hidden fees

✓ recommends best option

---

# Target User

Primary

Homeowners

Renters

Families

Secondary

Small Businesses

Third

Anyone buying services over phone.

---

# Target Vertical (Hackathon)

**Moving Companies**

Reason

Exactly matches challenge.

Easy to demo.

Real businesses exist.

Large price variation.

Later can expand to:

* Car repair
* Contractors
* Wedding vendors
* Medical billing
* Freight
* Equipment rental

---

# Core Workflow

```
User

↓

Voice Interview

↓

Structured Job Spec

↓

Business Discovery

↓

Parallel Calls

↓

Quote Extraction

↓

Negotiation

↓

Comparison Engine

↓

Recommendation

↓

User
```

---

# User Journey

## Step 1

Landing page

Button

> Start Saving Money

---

## Step 2

Voice Interview

Agent asks

Where are you moving?

How many bedrooms?

Any stairs?

Large furniture?

Moving date?

Boxes?

Special items?

Estimated budget?

---

Output

```json
{
pickup:
dropoff:
rooms:
stairs:
items:
moving_date:
notes:
}
```

---

## Step 3

Review Screen

User confirms

✓ Everything correct

OR edits manually.

---

## Step 4

Find Businesses

Google Places API

Returns

* company
* phone
* reviews
* rating
* location

---

## Step 5

Calling Dashboard

Shows

Company A

Calling...

Company B

Negotiating...

Company C

Waiting...

Live updates.

---

## Step 6

Negotiation

AI says

> Hello, I'm calling on behalf of my customer.

"We're moving from A to B."

"I already have another quote for $1800."

"Can you do better?"

Gets response.

Extracts

* price
* hidden fees
* discounts
* confidence

---

## Step 7

Comparison Dashboard

| Company | Price | Hidden Fees  | Rating | Confidence |
| ------- | ----- | ------------ | ------ | ---------- |
| A       | $2100 | None         | ★4.7   | High       |
| B       | $1800 | Long Carry   | ★4.3   | Medium     |
| C       | $1700 | Stairs Extra | ★3.8   | Low        |

---

## Step 8

Recommendation

Example

🏆 Best Choice

ABC Movers

Reason

Lowest trustworthy price.

No hidden fees.

Highest review score.

Transcript evidence attached.

---

# Functional Requirements

## Module 1

### Voice Intake Agent

Requirements

Voice conversation

Document upload

OCR

Extract structured job

Editable

Reusable

Tech

ElevenLabs

OpenAI

JSON schema

---

## Module 2

### Business Discovery

Google Places

Yelp

Search radius

Filter

Phone numbers

Business ratings

---

## Module 3

### Calling Agent

Must

Call multiple businesses

Handle interruptions

Repeat same job

Ask follow-up questions

Extract structured data

Support

Twilio

ElevenLabs

---

## Module 4

### Negotiation Agent

Strategies

Price match

Fee removal

Discount

Bundle offers

Ask for promotions

Never lie.

Must disclose AI if asked.

---

## Module 5

### Quote Parser

Extract

Base price

Tax

Fuel

Labor

Insurance

Extra fees

Discount

Binding quote

Estimate

Confidence

---

## Module 6

### Comparison Engine

Normalize

Different quote formats

Detect

Outliers

Suspicious prices

Missing fees

Score

Price

Reviews

Distance

Confidence

---

## Module 7

### Report Generator

Generate

Summary

Winner

Reason

Transcripts

Recordings

Evidence

Download PDF

---

# Non Functional Requirements

Response time

<5 sec UI updates

Parallel calls

3+

Transcript accuracy

95%

Availability

Hackathon demo ready

---

# AI Architecture

```
                GPT-5

                   │

        ┌──────────┼──────────┐

 Intake Agent

 Discovery Agent

 Negotiation Agent

 Quote Parser

 Report Agent
```

---

# Tech Stack

Frontend

Next.js

Tailwind

ShadCN

React Query

Backend

NestJS

BullMQ

Redis

Database

Postgres

Prisma

Storage

Supabase Storage

AI

GPT-5

ElevenLabs

Whisper

OCR

Mistral OCR

or GPT Vision

Telephony

Twilio

SIP

Maps

Google Places

Yelp API

Authentication

Clerk

Deployment

Vercel

Railway

Supabase

---

# Data Model

## Job

```
Job

id

pickup

destination

rooms

inventory

stairs

movingDate

status
```

---

## Business

```
Business

id

name

phone

rating

reviews

location
```

---

## Quote

```
Quote

id

business

price

fees

discount

confidence

transcript

recording
```

---

## Negotiation

```
Negotiation

id

callDuration

strategy

priceBefore

priceAfter

savedAmount
```

---

# External APIs

Mandatory

✅ ElevenLabs

✅ Twilio

Recommended

Google Places

Yelp

OpenAI

Maps

OCR

---

# Success Metrics

User Time Saved

2 hours

↓

5 minutes

Businesses Contacted

≥3

Negotiated Discount

5-15%

Transcript Accuracy

95%

---

# Demo Script (3–4 minutes)

1. User starts a new moving request.
2. Voice interview builds a structured job specification.
3. User reviews and confirms the details.
4. The app discovers three local moving companies.
5. AI places parallel calls (real, role-play, or agent-to-agent) and displays live call status.
6. During one call, the AI uses a competing quote to negotiate a lower price.
7. The dashboard updates with itemized quotes, fees, transcripts, and recordings.
8. The AI recommends the best option and explains *why* with transcript evidence.

---

# Stretch Goals

* Multi-language negotiation
* Email/SMS follow-up after calls
* Calendar booking with selected business
* CRM for previous negotiations
* Learning negotiation strategies from successful calls
* Cost prediction before making calls
* Marketplace-specific configuration (moving, auto repair, contractors) without changing code

---

# Future Product Roadmap

**Phase 1:** Moving companies (hackathon MVP)

**Phase 2:** Auto repair, home contractors, appliance repair

**Phase 3:** Medical billing, freight, equipment rental, B2B procurement

**Phase 4:** Autonomous AI procurement platform that continuously monitors markets, renegotiates recurring services, and proactively saves users money.

## What I would change to maximize hackathon scores

The brief emphasizes **conversation quality over technical complexity**. Instead of a generic negotiation platform, I'd narrow the MVP to **moving companies only** and make that experience exceptional. I'd also add two features that judges will remember:

1. **Live Negotiation Timeline** – During each call, show the negotiation as it unfolds ("Initial quote: $2,150 → Mentioned competitor: $1,900 → New offer: $1,850 → Free packing materials added"). This makes the AI's value instantly visible.

2. **Savings Dashboard** – At the end, show metrics such as:

   * Money saved
   * Hours of phone calls avoided
   * Hidden fees uncovered
   * Best-value recommendation (not just lowest price)

These additions create a much stronger demo than simply displaying transcripts, while directly aligning with the judging criteria for end-to-end workflow and evidence-backed recommendations.

