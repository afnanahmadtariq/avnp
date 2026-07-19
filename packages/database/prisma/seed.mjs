import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../dist/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the Relay database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const ids = {
  businesses: [
    "demo-business-pine",
    "demo-business-carolina",
    "demo-business-atlas",
  ],
  callAtlas: "demo-call-atlas",
  callCarolina: "demo-call-carolina",
  call: "demo-call-pine",
  decision: "demo-decision",
  evidence: "demo-evidence-pine-transcript",
  evidenceAtlas: "demo-evidence-atlas-transcript",
  evidenceCarolina: "demo-evidence-carolina-transcript",
  job: "demo-job",
  negotiation: "demo-negotiation-pine",
  negotiationAtlas: "demo-negotiation-atlas",
  negotiationCarolina: "demo-negotiation-carolina",
  outbox: "demo-outbox-report-ready",
  quote: "demo-quote-pine",
  quoteAtlas: "demo-quote-atlas",
  quoteCarolina: "demo-quote-carolina",
  recommendation: "demo-recommendation",
  run: "demo-run",
  specificationVersion: "demo-specification-version-1",
  user: "demo-user",
};

const specification = {
  bedrooms: 2,
  budget: { amountMinor: 220000, currency: "USD" },
  dropoffAddress: {
    city: "Charlotte",
    countryCode: "US",
    formattedAddress: "1200 South Boulevard, Charlotte, NC 28203",
    postalCode: "28203",
    region: "NC",
  },
  dropoffStairs: 0,
  hasElevator: true,
  inventory: [
    { name: "Queen bed", quantity: 1 },
    { name: "Sofa", quantity: 1 },
    { name: "Moving boxes", quantity: 24 },
  ],
  movingDate: "2026-08-15",
  notes:
    "Use the reserved loading bay at pickup. The destination elevator is booked from 9:00 AM to noon; wardrobe boxes should be included.",
  packingPreference: "partial",
  pickupAddress: {
    city: "Charlotte",
    countryCode: "US",
    formattedAddress: "500 North Tryon Street, Charlotte, NC 28202",
    postalCode: "28202",
    region: "NC",
  },
  pickupStairs: 1,
  specialItems: ["Television"],
  vertical: "moving",
};

async function seed() {
  await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: ids.user },
      update: {
        displayName: "Relay Demo",
        email: "demo@relay.local",
        profile: {
          location: "Charlotte, NC",
          phone: "+17045550100",
          representedAs: "Relay Demo",
          timezone: "America/New_York",
        },
        settings: {
          aiDisclosure: true,
          callbackAlerts: true,
          callMilestones: true,
          emailUpdates: false,
          evidenceRetentionDays: 30,
          recordingConsentDefault: false,
        },
      },
      create: {
        id: ids.user,
        displayName: "Relay Demo",
        email: "demo@relay.local",
        profile: {
          location: "Charlotte, NC",
          phone: "+17045550100",
          representedAs: "Relay Demo",
          timezone: "America/New_York",
        },
        settings: {
          aiDisclosure: true,
          callbackAlerts: true,
          callMilestones: true,
          emailUpdates: false,
          evidenceRetentionDays: 30,
          recordingConsentDefault: false,
        },
      },
    });

    await tx.job.upsert({
      where: { id: ids.job },
      update: {
        confirmedAt: new Date("2026-07-19T10:00:00.000Z"),
        publicId: "RLY-2048",
        specification,
        status: "COMPLETED",
        targetBudgetCents: 220000,
        title: "Charlotte apartment move",
        userId: ids.user,
      },
      create: {
        id: ids.job,
        confirmedAt: new Date("2026-07-19T10:00:00.000Z"),
        currency: "USD",
        publicId: "RLY-2048",
        specification,
        status: "COMPLETED",
        targetBudgetCents: 220000,
        title: "Charlotte apartment move",
        userId: ids.user,
      },
    });

    await tx.jobSpecificationVersion.upsert({
      where: { id: ids.specificationVersion },
      update: {
        confirmedAt: new Date("2026-07-19T10:00:00.000Z"),
        contentDigest: "sha256:relay-demo-moving-specification-v1",
        sourceMetadata: { fixture: "moving-v1", sources: ["guided_form"] },
        specification,
      },
      create: {
        id: ids.specificationVersion,
        confirmedAt: new Date("2026-07-19T10:00:00.000Z"),
        contentDigest: "sha256:relay-demo-moving-specification-v1",
        jobId: ids.job,
        sourceMetadata: { fixture: "moving-v1", sources: ["guided_form"] },
        specification,
        version: 1,
      },
    });

    const businessFixtures = [
      {
        address: {
          city: "Charlotte",
          countryCode: "US",
          formattedAddress: "Charlotte, NC",
        },
        externalId: "fixture-pine",
        id: ids.businesses[0],
        name: "Pine & Co. Moving",
        phone: "+17045550101",
        rating: "4.8",
        reviewCount: 214,
      },
      {
        address: {
          city: "Charlotte",
          countryCode: "US",
          formattedAddress: "Charlotte, NC",
        },
        externalId: "fixture-carolina",
        id: ids.businesses[1],
        name: "Carolina Transit",
        phone: "+17045550102",
        rating: "4.6",
        reviewCount: 168,
      },
      {
        address: {
          city: "Charlotte",
          countryCode: "US",
          formattedAddress: "Charlotte, NC",
        },
        externalId: "fixture-atlas",
        id: ids.businesses[2],
        name: "Atlas Moving Group",
        phone: "+17045550103",
        rating: "4.4",
        reviewCount: 121,
      },
    ];

    for (const [index, business] of businessFixtures.entries()) {
      await tx.business.upsert({
        where: { id: business.id },
        update: { ...business, provider: "fixture" },
        create: { ...business, provider: "fixture" },
      });
      await tx.jobBusiness.upsert({
        where: {
          jobId_businessId: { businessId: business.id, jobId: ids.job },
        },
        update: {
          discoveryRank: index + 1,
          relevanceScore: String(96 - index * 4),
          status: "RESPONDED",
        },
        create: {
          businessId: business.id,
          discoveryRank: index + 1,
          jobId: ids.job,
          relevanceScore: String(96 - index * 4),
          status: "RESPONDED",
        },
      });
    }

    await tx.negotiationRun.upsert({
      where: { id: ids.run },
      update: {
        aiDisclosureAcknowledgedAt: new Date("2026-07-19T10:01:00.000Z"),
        callingConsentAt: new Date("2026-07-19T10:01:00.000Z"),
        completedAt: new Date("2026-07-19T10:20:00.000Z"),
        configurationVersion: "moving-v1",
        consentVersion: "demo-consent-v1",
        recordingConsentAt: new Date("2026-07-19T10:01:00.000Z"),
        startedAt: new Date("2026-07-19T10:02:00.000Z"),
        status: "COMPLETED",
      },
      create: {
        aiDisclosureAcknowledgedAt: new Date("2026-07-19T10:01:00.000Z"),
        callingConsentAt: new Date("2026-07-19T10:01:00.000Z"),
        completedAt: new Date("2026-07-19T10:20:00.000Z"),
        configurationVersion: "moving-v1",
        consentVersion: "demo-consent-v1",
        correlationId: "demo-correlation-run-1",
        id: ids.run,
        jobId: ids.job,
        recordingConsentAt: new Date("2026-07-19T10:01:00.000Z"),
        specificationVersionId: ids.specificationVersion,
        startedAt: new Date("2026-07-19T10:02:00.000Z"),
        status: "COMPLETED",
      },
    });

    await tx.call.upsert({
      where: { id: ids.call },
      update: {
        aiDisclosureMadeAt: new Date("2026-07-19T10:04:00.000Z"),
        durationSeconds: 420,
        endedAt: new Date("2026-07-19T10:11:00.000Z"),
        recordingConsentAt: new Date("2026-07-19T10:03:00.000Z"),
        runId: ids.run,
        startedAt: new Date("2026-07-19T10:04:00.000Z"),
        status: "COMPLETED",
        structuredOutcome: { outcome: "quote_received", quoteId: ids.quote },
        transcriptText:
          "Relay: If we accept your earliest Saturday window, can you improve the all-in price?\nBusiness: I can remove the fuel surcharge and reduce labor. The guaranteed total is $1,840.\nRelay: Please confirm stairs, mileage, and wardrobe boxes are included.\nBusiness: Confirmed, with a three-person crew arriving between 8:00 and 9:00 AM.",
      },
      create: {
        aiDisclosureMadeAt: new Date("2026-07-19T10:04:00.000Z"),
        businessId: ids.businesses[0],
        durationSeconds: 420,
        endedAt: new Date("2026-07-19T10:11:00.000Z"),
        id: ids.call,
        jobId: ids.job,
        provider: "fixture",
        providerCallId: "fixture-call-pine-v1",
        recordingConsentAt: new Date("2026-07-19T10:03:00.000Z"),
        runId: ids.run,
        startedAt: new Date("2026-07-19T10:04:00.000Z"),
        status: "COMPLETED",
        structuredOutcome: { outcome: "quote_received", quoteId: ids.quote },
        transcriptText:
          "Relay: If we accept your earliest Saturday window, can you improve the all-in price?\nBusiness: I can remove the fuel surcharge and reduce labor. The guaranteed total is $1,840.\nRelay: Please confirm stairs, mileage, and wardrobe boxes are included.\nBusiness: Confirmed, with a three-person crew arriving between 8:00 and 9:00 AM.",
      },
    });

    await tx.negotiation.upsert({
      where: { id: ids.negotiation },
      update: {
        endedAt: new Date("2026-07-19T10:10:00.000Z"),
        finalAmountCents: 184000,
        runId: ids.run,
        savingsAmountCents: 37000,
        startingAmountCents: 221000,
        status: "IMPROVED",
      },
      create: {
        businessId: ids.businesses[0],
        endedAt: new Date("2026-07-19T10:10:00.000Z"),
        finalAmountCents: 184000,
        id: ids.negotiation,
        jobId: ids.job,
        runId: ids.run,
        savingsAmountCents: 37000,
        startedAt: new Date("2026-07-19T10:05:00.000Z"),
        startingAmountCents: 221000,
        status: "IMPROVED",
        strategy: "FEE_REMOVAL",
      },
    });

    await tx.call.update({
      where: { id: ids.call },
      data: { negotiationId: ids.negotiation },
    });

    await tx.quote.upsert({
      where: { id: ids.quote },
      update: {
        callId: ids.call,
        completeness: "1.0",
        confidence: "0.96",
        depositAmountCents: 36800,
        estimateType: "BINDING",
        negotiatedSavingCents: 37000,
        negotiationId: ids.negotiation,
        originalAmountCents: 221000,
        recommendationReason:
          "Lowest complete binding offer with confirmed arrival, deposit, and included scope.",
        riskFlags: [],
        runId: ids.run,
        score: "92.50",
        status: "FINAL",
        terms: {
          arrivalWindow: "8:00–9:00 AM",
          cancellationPolicy:
            "Free cancellation up to 48 hours before arrival; the deposit can transfer once with 24 hours' notice.",
          crewSize: 3,
          depositPolicy: "20% due when booked",
          estimatedDuration: "5–6 hours",
          packingIncluded: true,
        },
        totalAmountCents: 184000,
      },
      create: {
        businessId: ids.businesses[0],
        callId: ids.call,
        completeness: "1.0",
        confidence: "0.96",
        currency: "USD",
        depositAmountCents: 36800,
        estimateType: "BINDING",
        id: ids.quote,
        jobId: ids.job,
        negotiatedSavingCents: 37000,
        negotiationId: ids.negotiation,
        originalAmountCents: 221000,
        pricingModel: "FIXED",
        recommendationReason:
          "Lowest complete binding offer with confirmed arrival, deposit, and included scope.",
        riskFlags: [],
        runId: ids.run,
        score: "92.50",
        status: "FINAL",
        terms: {
          arrivalWindow: "8:00–9:00 AM",
          cancellationPolicy:
            "Free cancellation up to 48 hours before arrival; the deposit can transfer once with 24 hours' notice.",
          crewSize: 3,
          depositPolicy: "20% due when booked",
          estimatedDuration: "5–6 hours",
          packingIncluded: true,
        },
        totalAmountCents: 184000,
      },
    });

    await tx.quoteItem.upsert({
      where: { id: "demo-quote-item-transport" },
      update: {
        includedInTotal: true,
        label: "Moving service",
        required: true,
        totalAmountCents: 174000,
      },
      create: {
        category: "transportation",
        disclosed: true,
        feeCode: "moving_service",
        id: "demo-quote-item-transport",
        includedInTotal: true,
        label: "Moving service",
        lineNumber: 1,
        quoteId: ids.quote,
        required: true,
        totalAmountCents: 174000,
      },
    });

    await tx.quoteItem.upsert({
      where: { id: "demo-quote-item-materials" },
      update: {
        includedInTotal: true,
        label: "Packing materials",
        required: false,
        totalAmountCents: 10000,
      },
      create: {
        category: "materials",
        disclosed: true,
        feeCode: "packing_materials",
        id: "demo-quote-item-materials",
        includedInTotal: true,
        label: "Packing materials",
        lineNumber: 2,
        quoteId: ids.quote,
        required: false,
        totalAmountCents: 10000,
      },
    });

    const comparisonFixtures = [
      {
        arrivalWindow: "9:00–11:00 AM",
        businessId: ids.businesses[1],
        cancellationPolicy:
          "The deposit is refundable up to 72 hours before arrival.",
        callId: ids.callCarolina,
        completeness: "0.94",
        confidence: "0.91",
        crewSize: 3,
        depositAmountCents: 51250,
        depositPolicy: "25% due when booked",
        endedAt: "2026-07-19T10:14:00.000Z",
        evidenceId: ids.evidenceCarolina,
        estimateType: "BINDING",
        estimatedDuration: "5–7 hours",
        negotiationId: ids.negotiationCarolina,
        negotiationStatus: "UNCHANGED",
        phoneLabel: "carolina",
        quoteId: ids.quoteCarolina,
        recommendationReason:
          "Complete binding alternative with confirmed arrival and deposit terms, but no negotiated improvement.",
        riskFlags: [],
        score: "84.00",
        startedAt: "2026-07-19T10:06:00.000Z",
        totalAmountCents: 205000,
        transcriptText:
          "Relay: Can you improve the all-in price without changing the three-person crew?\nBusiness: We cannot reduce the complete binding quote below $2,050.\nRelay: Please confirm the 9:00–11:00 AM arrival window and 25% booking deposit.\nBusiness: Confirmed; packing materials and mileage are included.",
      },
      {
        arrivalWindow: "12:00–3:00 PM",
        businessId: ids.businesses[2],
        cancellationPolicy:
          "The deposit is refundable up to five days before arrival.",
        callId: ids.callAtlas,
        completeness: "0.80",
        confidence: "0.76",
        crewSize: 3,
        depositAmountCents: 62000,
        depositPolicy: "25% due when booked",
        endedAt: "2026-07-19T10:17:00.000Z",
        evidenceId: ids.evidenceAtlas,
        estimateType: "NON_BINDING",
        estimatedDuration: "6–8 hours",
        negotiationId: ids.negotiationAtlas,
        negotiationStatus: "DECLINED",
        phoneLabel: "atlas",
        quoteId: ids.quoteAtlas,
        recommendationReason:
          "Higher non-binding estimate with an unresolved access fee.",
        riskFlags: [
          {
            code: "unknown_access_fee",
            description:
              "A possible access fee was disclosed without an amount.",
            severity: "warning",
          },
        ],
        score: "70.00",
        startedAt: "2026-07-19T10:08:00.000Z",
        totalAmountCents: 248000,
        transcriptText:
          "Relay: Is every required access fee included in the $2,480 estimate?\nBusiness: The estimate is non-binding and an access fee may still apply.\nRelay: Please confirm the noon–3:00 PM arrival window and three-person crew.\nBusiness: Confirmed, but the access fee cannot be priced until the site review.",
      },
    ];

    for (const fixture of comparisonFixtures) {
      await tx.call.upsert({
        where: { id: fixture.callId },
        update: {
          durationSeconds: 480,
          endedAt: new Date(fixture.endedAt),
          runId: ids.run,
          startedAt: new Date(fixture.startedAt),
          status: "COMPLETED",
          structuredOutcome: {
            outcome: "quote_received",
            quoteId: fixture.quoteId,
          },
          transcriptText: fixture.transcriptText,
        },
        create: {
          aiDisclosureMadeAt: new Date(fixture.startedAt),
          businessId: fixture.businessId,
          durationSeconds: 480,
          endedAt: new Date(fixture.endedAt),
          id: fixture.callId,
          jobId: ids.job,
          provider: "fixture",
          providerCallId: `fixture-call-${fixture.phoneLabel}-v1`,
          recordingConsentAt: new Date("2026-07-19T10:03:00.000Z"),
          runId: ids.run,
          startedAt: new Date(fixture.startedAt),
          status: "COMPLETED",
          structuredOutcome: {
            outcome: "quote_received",
            quoteId: fixture.quoteId,
          },
          transcriptText: fixture.transcriptText,
        },
      });

      await tx.negotiation.upsert({
        where: { id: fixture.negotiationId },
        update: {
          endedAt: new Date(fixture.endedAt),
          finalAmountCents: fixture.totalAmountCents,
          runId: ids.run,
          savingsAmountCents: 0,
          startingAmountCents: fixture.totalAmountCents,
          status: fixture.negotiationStatus,
        },
        create: {
          businessId: fixture.businessId,
          endedAt: new Date(fixture.endedAt),
          finalAmountCents: fixture.totalAmountCents,
          id: fixture.negotiationId,
          jobId: ids.job,
          runId: ids.run,
          savingsAmountCents: 0,
          startedAt: new Date(fixture.startedAt),
          startingAmountCents: fixture.totalAmountCents,
          status: fixture.negotiationStatus,
          strategy: "DISCOUNT_REQUEST",
        },
      });

      await tx.call.update({
        where: { id: fixture.callId },
        data: { negotiationId: fixture.negotiationId },
      });

      await tx.quote.upsert({
        where: { id: fixture.quoteId },
        update: {
          callId: fixture.callId,
          completeness: fixture.completeness,
          confidence: fixture.confidence,
          depositAmountCents: fixture.depositAmountCents,
          estimateType: fixture.estimateType,
          negotiationId: fixture.negotiationId,
          originalAmountCents: fixture.totalAmountCents,
          recommendationReason: fixture.recommendationReason,
          riskFlags: fixture.riskFlags,
          runId: ids.run,
          score: fixture.score,
          status: "FINAL",
          terms: {
            arrivalWindow: fixture.arrivalWindow,
            cancellationPolicy: fixture.cancellationPolicy,
            crewSize: fixture.crewSize,
            depositPolicy: fixture.depositPolicy,
            estimatedDuration: fixture.estimatedDuration,
          },
          totalAmountCents: fixture.totalAmountCents,
        },
        create: {
          businessId: fixture.businessId,
          callId: fixture.callId,
          completeness: fixture.completeness,
          confidence: fixture.confidence,
          currency: "USD",
          depositAmountCents: fixture.depositAmountCents,
          estimateType: fixture.estimateType,
          id: fixture.quoteId,
          jobId: ids.job,
          negotiationId: fixture.negotiationId,
          originalAmountCents: fixture.totalAmountCents,
          pricingModel: "FIXED",
          recommendationReason: fixture.recommendationReason,
          riskFlags: fixture.riskFlags,
          runId: ids.run,
          score: fixture.score,
          status: "FINAL",
          terms: {
            arrivalWindow: fixture.arrivalWindow,
            cancellationPolicy: fixture.cancellationPolicy,
            crewSize: fixture.crewSize,
            depositPolicy: fixture.depositPolicy,
            estimatedDuration: fixture.estimatedDuration,
          },
          totalAmountCents: fixture.totalAmountCents,
        },
      });

      await tx.quoteItem.upsert({
        where: { id: `${fixture.quoteId}-item-service` },
        update: {
          includedInTotal: true,
          required: true,
          totalAmountCents: fixture.totalAmountCents,
        },
        create: {
          category: "transportation",
          disclosed: true,
          feeCode: "moving_service",
          id: `${fixture.quoteId}-item-service`,
          includedInTotal: true,
          label: "Moving service",
          lineNumber: 1,
          quoteId: fixture.quoteId,
          required: true,
          totalAmountCents: fixture.totalAmountCents,
        },
      });

      if (fixture.quoteId === ids.quoteAtlas) {
        await tx.quoteItem.upsert({
          where: { id: `${fixture.quoteId}-item-unknown-access` },
          update: {
            includedInTotal: false,
            required: false,
            totalAmountCents: null,
          },
          create: {
            category: "access",
            disclosed: true,
            feeCode: "possible_access_fee",
            id: `${fixture.quoteId}-item-unknown-access`,
            includedInTotal: false,
            label: "Possible access fee",
            lineNumber: 2,
            quoteId: fixture.quoteId,
            required: false,
            totalAmountCents: null,
          },
        });
      }

      await tx.evidence.upsert({
        where: { id: fixture.evidenceId },
        update: {
          callId: fixture.callId,
          quoteId: fixture.quoteId,
          retentionUntil: new Date("2026-08-18T10:20:00.000Z"),
          runId: ids.run,
        },
        create: {
          callId: fixture.callId,
          contentType: "text/plain",
          id: fixture.evidenceId,
          jobId: ids.job,
          kind: "TRANSCRIPT",
          metadata: { fixture: true },
          provider: "fixture",
          quoteId: fixture.quoteId,
          retentionUntil: new Date("2026-08-18T10:20:00.000Z"),
          runId: ids.run,
          storageKey: `fixtures/RLY-2048/${fixture.phoneLabel}-transcript.txt`,
        },
      });
    }

    await tx.evidence.upsert({
      where: { id: ids.evidence },
      update: {
        callId: ids.call,
        quoteId: ids.quote,
        retentionUntil: new Date("2026-08-18T10:20:00.000Z"),
        runId: ids.run,
      },
      create: {
        callId: ids.call,
        contentType: "text/plain",
        id: ids.evidence,
        jobId: ids.job,
        kind: "TRANSCRIPT",
        metadata: { fixture: true },
        provider: "fixture",
        quoteId: ids.quote,
        retentionUntil: new Date("2026-08-18T10:20:00.000Z"),
        runId: ids.run,
        storageKey: "fixtures/RLY-2048/pine-transcript.txt",
      },
    });

    await tx.runEvent.upsert({
      where: { runId_sequence: { runId: ids.run, sequence: 1 } },
      update: {
        eventType: "run.completed",
        payload: { quoteCount: 3, recommendationId: ids.recommendation },
      },
      create: {
        actor: "WORKER",
        correlationId: "demo-correlation-run-1",
        eventType: "run.completed",
        id: "demo-run-event-1",
        occurredAt: new Date("2026-07-19T10:20:00.000Z"),
        payload: { quoteCount: 3, recommendationId: ids.recommendation },
        runId: ids.run,
        sequence: 1,
      },
    });

    await tx.recommendation.upsert({
      where: { id: ids.recommendation },
      update: {
        bestQuoteId: ids.quote,
        explanation:
          "Pine & Co. offers the strongest verified value: the lowest complete binding price, a confirmed morning arrival, and clear deposit terms.",
        factors: [
          {
            key: "value",
            label: "Best value",
            reason: "Lowest complete binding quote",
            score: 0.93,
          },
        ],
        rankedQuoteIds: [ids.quote, ids.quoteCarolina, ids.quoteAtlas],
        savingsAmountCents: 37000,
      },
      create: {
        bestQuoteId: ids.quote,
        configurationVersion: "moving-v1",
        currency: "USD",
        explanation:
          "Pine & Co. offers the strongest verified value: the lowest complete binding price, a confirmed morning arrival, and clear deposit terms.",
        factors: [
          {
            key: "value",
            label: "Best value",
            reason: "Lowest complete binding quote",
            score: 0.93,
          },
        ],
        id: ids.recommendation,
        policyVersion: "quote-scoring-v1",
        rankedQuoteIds: [ids.quote, ids.quoteCarolina, ids.quoteAtlas],
        runId: ids.run,
        savingsAmountCents: 37000,
      },
    });

    await tx.decision.upsert({
      where: { id: ids.decision },
      update: {
        note: "Selected for the strongest verified all-in value and complete scope.",
        outcome: "QUOTE_SELECTED",
        recommendationId: ids.recommendation,
        selectedQuoteId: ids.quote,
      },
      create: {
        decidedAt: new Date("2026-07-19T10:25:00.000Z"),
        id: ids.decision,
        note: "Selected for the strongest verified all-in value and complete scope.",
        outcome: "QUOTE_SELECTED",
        recommendationId: ids.recommendation,
        runId: ids.run,
        selectedQuoteId: ids.quote,
      },
    });

    await tx.outboxEvent.upsert({
      where: { id: ids.outbox },
      update: {
        payload: { jobId: ids.job, runId: ids.run },
        publishedAt: new Date("2026-07-19T10:20:01.000Z"),
      },
      create: {
        aggregateId: ids.run,
        aggregateType: "NegotiationRun",
        correlationId: "demo-correlation-run-1",
        eventType: "run.report-ready",
        id: ids.outbox,
        idempotencyKey: "demo-run-report-ready-v1",
        payload: { jobId: ids.job, runId: ids.run },
        publishedAt: new Date("2026-07-19T10:20:01.000Z"),
      },
    });
  });
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
