import { jobSpecificationSchema } from "@relay/contracts";
import { describe, expect, it } from "vitest";

import {
  DEMO_JOB_PUBLIC_ID,
  DEMO_RUN_ID,
  FIXTURE_PROVIDER,
  demoBusinesses,
  demoMarket,
  demoRecordIds,
  demoSpecification,
} from "./demo-fixtures.js";

describe("deterministic product fixtures", () => {
  it("contains a contract-valid moving brief", () => {
    expect(jobSpecificationSchema.safeParse(demoSpecification).success).toBe(
      true,
    );
    expect(DEMO_JOB_PUBLIC_ID).toBe("RLY-2048");
  });

  it("provides three distinct callable businesses", () => {
    expect(FIXTURE_PROVIDER).toBe("fixture");
    expect(demoBusinesses).toHaveLength(3);
    expect(new Set(demoBusinesses.map((business) => business.id)).size).toBe(3);
    expect(
      demoBusinesses.every((business) => /^\+1\d{10}$/.test(business.phone)),
    ).toBe(true);
  });

  it("covers savings, unchanged pricing, and non-binding risk", () => {
    expect(demoMarket[0]?.initialOfferCents).toBe(221_000);
    expect(demoMarket[0]?.currentOfferCents).toBe(184_000);
    expect(
      demoMarket.some(
        (offer) => offer.initialOfferCents === offer.currentOfferCents,
      ),
    ).toBe(true);
    expect(
      demoMarket.some((offer) => offer.estimateType === "NON_BINDING"),
    ).toBe(true);
  });

  it("provides customer-ready quote terms and evidence transcripts", () => {
    expect(
      demoMarket.every(
        (offer) =>
          offer.arrivalWindow.length > 0 &&
          offer.cancellationPolicy.length > 0 &&
          offer.crewSize > 0 &&
          offer.depositCents > 0 &&
          offer.depositCents < offer.currentOfferCents &&
          offer.depositPolicy.length > 0 &&
          offer.estimatedDuration.length > 0,
      ),
    ).toBe(true);
    expect(
      demoMarket.every(
        (offer) => !/\b(?:deterministic|fixture)\b/i.test(offer.transcript),
      ),
    ).toBe(true);
  });

  it("pins stable identifiers for every seeded call outcome", () => {
    expect(DEMO_RUN_ID).toBe("demo-run");
    expect(demoRecordIds.calls).toHaveLength(demoBusinesses.length);
    expect(demoRecordIds.quotes).toHaveLength(demoBusinesses.length);
    expect(demoRecordIds.evidence).toHaveLength(demoBusinesses.length);
  });
});
