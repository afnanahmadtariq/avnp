import type { Business, Quote } from "@relay/contracts";
import { describe, expect, it } from "vitest";

import { rankQuotes, scoreQuote, selectBestQuote } from "./quote-scoring.js";

const baseQuote: Quote = {
  id: "quote-base",
  jobId: "job-1",
  businessId: "business-base",
  status: "final",
  pricingModel: "fixed",
  estimateType: "binding",
  totalPrice: { amountMinor: 100_000, currency: "USD" },
  fees: [],
  confidence: 0.95,
  evidence: {
    source: "written_quote",
    transcriptKey: "quotes/base.txt",
  },
  capturedAt: "2026-07-18T10:00:00Z",
};

function makeQuote(
  id: string,
  amountMinor: number,
  overrides: Partial<Quote> = {},
): Quote {
  return {
    ...baseQuote,
    id,
    businessId: `business-${id}`,
    totalPrice: { amountMinor, currency: "USD" },
    ...overrides,
  };
}

function business(
  rating: number,
  reviewCount: number,
): Pick<Business, "rating" | "reviewCount"> {
  return { rating, reviewCount };
}

describe("quote scoring", () => {
  it("ranks a lower clean quote first when trust signals are equal", () => {
    const rankings = rankQuotes([
      { quote: makeQuote("high", 120_000), business: business(4.5, 100) },
      { quote: makeQuote("low", 100_000), business: business(4.5, 100) },
    ]);

    expect(rankings.map((ranking) => ranking.quoteId)).toEqual(["low", "high"]);
    expect(rankings[0]?.rank).toBe(1);
    expect(rankings[0]?.components.price).toBe(100);
  });

  it("does not recommend a suspicious teaser price over a trustworthy quote", () => {
    const teaser = makeQuote("teaser", 50_000, {
      estimateType: "non_binding",
      confidence: 0.45,
      fees: [
        {
          code: "unknown",
          label: "Additional charges",
          category: "other",
          amount: null,
          required: true,
          includedInTotal: false,
          disclosed: false,
        },
      ],
    });
    const trusted = makeQuote("trusted", 100_000);
    const comparison = makeQuote("comparison", 105_000);
    const rankings = rankQuotes([
      { quote: teaser, business: business(3.5, 4) },
      { quote: trusted, business: business(4.9, 200) },
      { quote: comparison, business: business(4.6, 150) },
    ]);

    expect(rankings[0]?.quoteId).toBe("trusted");
    expect(
      rankings
        .find((ranking) => ranking.quoteId === "teaser")
        ?.redFlags.map((flag) => flag.code),
    ).toContain("suspiciously_low_total");
  });

  it("marks expired and withdrawn quotes ineligible and ranks them last", () => {
    const active = makeQuote("active", 120_000);
    const expired = makeQuote("expired", 90_000, {
      validUntil: "2026-06-01T00:00:00Z",
    });
    const withdrawn = makeQuote("withdrawn", 80_000, {
      status: "withdrawn",
    });
    const rankings = rankQuotes(
      [{ quote: withdrawn }, { quote: expired }, { quote: active }],
      { referenceTime: "2026-07-18T00:00:00Z" },
    );

    expect(rankings[0]).toMatchObject({ eligible: true, quoteId: "active" });
    expect(rankings.slice(1).every((ranking) => !ranking.eligible)).toBe(true);
  });

  it("keeps single-quote scoring deterministic and honors normalized weights", () => {
    const quote = makeQuote("single", 90_000);
    const score = scoreQuote(
      { quote, business: business(5, 100) },
      {
        weights: {
          completeness: 0,
          confidence: 0,
          price: 0,
          reputation: 10,
        },
      },
    );

    expect(score.totalScore).toBe(100);
    expect(selectBestQuote([{ quote }])?.quoteId).toBe("single");
  });

  it("refuses to compare currencies without an explicit normalization step", () => {
    const usd = makeQuote("usd", 100_000);
    const eur = makeQuote("eur", 90_000, {
      totalPrice: { amountMinor: 90_000, currency: "EUR" },
    });

    expect(() => rankQuotes([{ quote: usd }, { quote: eur }])).toThrow(
      "Quotes must use one currency",
    );
  });

  it("uses review volume to temper unreliable perfect ratings", () => {
    const quote = makeQuote("rated", 100_000);
    const established = scoreQuote({
      quote,
      business: business(4.8, 200),
    });
    const unproven = scoreQuote({
      quote,
      business: business(5, 0),
    });

    expect(established.components.reputation).toBeGreaterThan(
      unproven.components.reputation,
    );
  });
});
