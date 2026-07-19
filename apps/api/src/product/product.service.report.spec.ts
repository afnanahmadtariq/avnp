import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { ProductService } from "./product.service.js";

function quoteFixture(
  id: string,
  businessId: string,
  businessName: string,
  score: number,
  totalAmountCents: number,
  createdAt: Date,
) {
  return {
    business: {
      name: businessName,
      rating: 4.8,
      reviewCount: 120,
    },
    businessId,
    callId: `call-${id}`,
    confidence: 0.9,
    createdAt,
    depositAmountCents: 10_000,
    evidence: [{ id: `evidence-${id}` }],
    id,
    items: [{ includedInTotal: true, label: "Labor" }],
    negotiatedSavingCents: 20_000,
    originalAmountCents: totalAmountCents + 20_000,
    riskFlags: ["persisted_quote_risk"],
    score,
    status: "FINAL",
    terms: { arrivalWindow: "8:00-10:00 AM" },
    totalAmountCents,
  };
}

function completedRunFixture() {
  const bestQuote = quoteFixture(
    "quote-best",
    "business-best",
    "Pine Moving",
    81,
    180_000,
    new Date("2026-07-20T10:01:00.000Z"),
  );
  const otherQuote = quoteFixture(
    "quote-other",
    "business-other",
    "Carolina Transit",
    96,
    170_000,
    new Date("2026-07-20T10:00:00.000Z"),
  );

  return {
    calls: [{ durationSeconds: 120 }, { durationSeconds: 180 }],
    decision: null,
    id: "run-1",
    quotes: [otherQuote, bestQuote],
    recommendation: {
      bestQuoteId: "quote-best",
      explanation: "Pine has the strongest verified terms.",
      factors: [
        { quoteId: "quote-best", rank: 1, totalScore: 93 },
        { quoteId: "quote-other", rank: 2, totalScore: 89 },
      ],
      id: "recommendation-1",
      policyVersion: "quote-ranking-v2",
      rankedQuoteIds: ["quote-best", "quote-other"],
      savingsAmountCents: 20_000,
    },
    status: "COMPLETED",
  };
}

function createService(databaseClient: Record<string, unknown>) {
  return new ProductService(
    { client: databaseClient } as unknown as PrismaService,
    { value: { mode: "live" } } as RuntimeConfigService,
    {} as CurrentIdentityService,
    {} as OutboxDispatcherService,
  );
}

describe("persisted run reports", () => {
  it("presents the finalized worker recommendation without reranking or writing", async () => {
    const quoteUpdate = vi.fn();
    const recommendationUpsert = vi.fn();
    const service = createService({
      quote: { update: quoteUpdate },
      recommendation: { upsert: recommendationUpsert },
    });
    Reflect.set(
      service,
      "findOwnedRun",
      vi.fn(async () => completedRunFixture()),
    );

    const report = (await service.getReport("run-1")) as {
      rankedOffers: { id: string; rank: number; score: number }[];
      recommendation: { confidence: number; quoteId: string };
    };

    expect(report.rankedOffers).toEqual([
      expect.objectContaining({ id: "quote-best", rank: 1, score: 81 }),
      expect.objectContaining({ id: "quote-other", rank: 2, score: 96 }),
    ]);
    expect(report.recommendation).toEqual(
      expect.objectContaining({ confidence: 0.93, quoteId: "quote-best" }),
    );
    expect(quoteUpdate).not.toHaveBeenCalled();
    expect(recommendationUpsert).not.toHaveBeenCalled();
  });

  it("saves a non-recommended offer without changing the finalized recommendation", async () => {
    const decidedAt = new Date("2026-07-20T10:05:00.000Z");
    const decisionUpsert = vi.fn(async () => ({ decidedAt }));
    const quoteUpdate = vi.fn();
    const recommendationUpsert = vi.fn();
    const service = createService({
      decision: { upsert: decisionUpsert },
      quote: { update: quoteUpdate },
      recommendation: { upsert: recommendationUpsert },
    });
    Reflect.set(
      service,
      "findOwnedRun",
      vi.fn(async () => completedRunFixture()),
    );
    const appendRunEvent = vi.fn(async () => undefined);
    Reflect.set(service, "appendRunEvent", appendRunEvent);

    const result = (await service.saveDecision("run-1", {
      note: "Preferred schedule",
      quoteId: "quote-other",
    })) as {
      quoteId: string;
      recommendation: { quoteId: string };
      saved: boolean;
    };

    expect(decisionUpsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        note: "Preferred schedule",
        recommendationId: "recommendation-1",
        selectedQuoteId: "quote-other",
      }),
      update: expect.objectContaining({
        note: "Preferred schedule",
        recommendationId: "recommendation-1",
        selectedQuoteId: "quote-other",
      }),
      where: { runId: "run-1" },
    });
    expect(result).toEqual(
      expect.objectContaining({
        quoteId: "quote-other",
        recommendation: expect.objectContaining({ quoteId: "quote-best" }),
        saved: true,
      }),
    );
    expect(appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "decision.saved",
      "USER",
      { quoteId: "quote-other" },
    );
    expect(quoteUpdate).not.toHaveBeenCalled();
    expect(recommendationUpsert).not.toHaveBeenCalled();
  });
});
