import { describe, expect, it } from "vitest";

import {
  accessSummary,
  createMovingSpecification,
  inventorySummary,
} from "./job-specification";

describe("moving specification mapping", () => {
  it("normalizes the guided brief into the shared moving schema shape", () => {
    const specification = createMovingSpecification({
      access: "One flight at pickup; elevator at drop-off",
      budget: "Under $2,000",
      destination: "Charlotte, NC",
      flexibility: "I can be flexible",
      homeSize: "2-bedroom apartment",
      inventory: "26 boxes, sectional, queen bed",
      moveDate: "2026-07-28",
      origin: "Rock Hill, SC",
    });

    expect(specification).toMatchObject({
      bedrooms: 2,
      budget: { amountMinor: 200_000, currency: "USD" },
      dropoffAddress: { formattedAddress: "Charlotte, NC" },
      hasElevator: true,
      pickupAddress: { formattedAddress: "Rock Hill, SC" },
      pickupStairs: 1,
      vertical: "moving",
    });
    expect(specification.inventory[0]).toEqual({
      name: "boxes",
      quantity: 26,
    });
    expect(inventorySummary(specification)).toContain("26 boxes");
    expect(accessSummary(specification)).toContain("elevator available");
  });
});
