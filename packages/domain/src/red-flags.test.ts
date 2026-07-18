import type { Quote, QuoteFee } from "@relay/contracts";
import { describe, expect, it } from "vitest";

import { detectQuoteRedFlags } from "./red-flags.js";

const baseQuote: Quote = {
  id: "quote-1",
  jobId: "job-1",
  businessId: "business-1",
  status: "final",
  pricingModel: "fixed",
  estimateType: "binding",
  totalPrice: { amountMinor: 120_000, currency: "USD" },
  fees: [],
  confidence: 0.95,
  evidence: {
    source: "phone_call",
    callId: "call-1",
    transcriptKey: "transcripts/call-1.txt",
  },
  capturedAt: "2026-07-18T10:00:00Z",
  validUntil: "2026-08-18T10:00:00Z",
};

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return { ...baseQuote, ...overrides };
}

function makeFee(overrides: Partial<QuoteFee> = {}): QuoteFee {
  return {
    code: "fuel",
    label: "Fuel surcharge",
    category: "transportation",
    amount: { amountMinor: 5_000, currency: "USD" },
    required: true,
    includedInTotal: true,
    disclosed: true,
    ...overrides,
  };
}

describe("detectQuoteRedFlags", () => {
  it("surfaces fee disclosure and completeness risks", () => {
    const quote = makeQuote({
      estimateType: "non_binding",
      confidence: 0.4,
      fees: [
        makeFee({
          amount: null,
          disclosed: false,
          includedInTotal: false,
        }),
      ],
    });

    const flags = detectQuoteRedFlags(quote, {
      expectedFeeCodes: ["fuel", "stairs"],
      requireEvidence: true,
    });

    expect(flags.map((flag) => flag.code)).toEqual(
      expect.arrayContaining([
        "excluded_required_fee",
        "low_confidence",
        "missing_expected_fee",
        "non_binding_estimate",
        "undisclosed_fee",
        "unknown_fee_amount",
      ]),
    );
    expect(
      flags.find((flag) => flag.code === "missing_expected_fee")?.details,
    ).toEqual(["stairs"]);
  });

  it("uses an explicit clock for deterministic expiration checks", () => {
    const activeFlags = detectQuoteRedFlags(baseQuote, {
      referenceTime: "2026-08-01T00:00:00Z",
    });
    const expiredFlags = detectQuoteRedFlags(baseQuote, {
      referenceTime: "2026-09-01T00:00:00Z",
    });

    expect(activeFlags.some((flag) => flag.code === "expired_quote")).toBe(
      false,
    );
    expect(expiredFlags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "expired_quote",
          severity: "high",
        }),
      ]),
    );
  });

  it("detects incomplete hourly and range pricing", () => {
    const hourlyFlags = detectQuoteRedFlags(
      makeQuote({ pricingModel: "hourly" }),
    );
    const rangeFlags = detectQuoteRedFlags(
      makeQuote({ pricingModel: "range" }),
    );

    expect(hourlyFlags.map((flag) => flag.code)).toContain(
      "incomplete_pricing",
    );
    expect(rangeFlags.map((flag) => flag.code)).toContain("incomplete_pricing");
  });

  it("rejects invalid risk thresholds instead of silently changing them", () => {
    expect(() =>
      detectQuoteRedFlags(baseQuote, { suspiciousLowRatio: 1.1 }),
    ).toThrow(RangeError);
  });
});
