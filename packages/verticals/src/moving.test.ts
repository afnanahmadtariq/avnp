import { describe, expect, it } from "vitest";

import { getVerticalConfig, movingVertical, verticals } from "./index.js";

describe("movingVertical", () => {
  it("defines the required intake facts once", () => {
    const keys = movingVertical.intakeFields.map((field) => field.key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "pickupAddress",
        "dropoffAddress",
        "movingDate",
        "bedrooms",
        "pickupStairs",
        "dropoffStairs",
        "inventory",
      ]),
    );
  });

  it("keeps fee taxonomy itemized and disclosure-focused", () => {
    const feeCodes = movingVertical.feeTaxonomy.map((fee) => fee.code);
    const stairFee = movingVertical.feeTaxonomy.find(
      (fee) => fee.code === "stairs",
    );

    expect(new Set(feeCodes).size).toBe(feeCodes.length);
    expect(
      movingVertical.feeTaxonomy.every((fee) => fee.disclosureRequired),
    ).toBe(true);
    expect(stairFee).toMatchObject({
      category: "access",
      normallyApplies: "conditional",
    });
  });

  it("marks every scaffold benchmark for review", () => {
    for (const benchmark of movingVertical.benchmarks) {
      expect(benchmark.range.min).toBeLessThanOrEqual(benchmark.range.max);
      expect(benchmark.reviewBeforeUse).toBe(true);
    }
  });

  it("contains deterministic safety rules and truthful leverage policy", () => {
    const ruleIds = movingVertical.redFlagRules.map((rule) => rule.id);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        "missing-written-total",
        "undisclosed-fee",
        "large-deposit",
        "price-outlier",
      ]),
    );
    expect(movingVertical.negotiationPolicy).toMatchObject({
      truthfulnessRequired: true,
      mayReferenceCompetitorQuoteOnlyWhenDocumented: true,
    });
    expect(
      movingVertical.redFlagRules.find((rule) => rule.id === "price-outlier")
        ?.condition,
    ).toEqual({ kind: "quote-outlier", deviationPercent: 30 });
  });
});

describe("vertical registry", () => {
  it("returns the registered moving configuration", () => {
    expect(Object.keys(verticals)).toEqual(["moving"]);
    expect(getVerticalConfig("moving")).toBe(movingVertical);
  });
});
