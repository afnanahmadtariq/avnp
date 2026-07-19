import { describe, expect, it } from "vitest";

import {
  extractionConfidenceLabel,
  intakeFileError,
  MAX_INTAKE_FILE_BYTES,
  mergeIntakeExtraction,
  type MovingIntakeFields,
} from "./intake";

const current: MovingIntakeFields = {
  access: "Ground-floor access",
  budget: "Best value, not a fixed cap",
  destination: "Charlotte, NC",
  flexibility: "I can be flexible",
  homeSize: "1-bedroom apartment",
  inventory: "10 boxes",
  moveDate: "2026-08-01",
  origin: "Rock Hill, SC",
};

describe("intake helpers", () => {
  it("merges only facts present in an extraction", () => {
    const merged = mergeIntakeExtraction(current, {
      confidence: 0.91,
      facts: {
        bedrooms: 3,
        dropoffAddress: { formattedAddress: "Raleigh, NC" },
        hasElevator: true,
        inventory: [
          { name: "boxes", quantity: 24 },
          { name: "piano", quantity: 1 },
        ],
        movingDate: "2026-08-14",
        pickupStairs: 2,
        specialItems: ["Antique mirror"],
      },
    });

    expect(merged).toMatchObject({
      access: "2 flights at pickup; elevator available",
      budget: current.budget,
      destination: "Raleigh, NC",
      homeSize: "3-bedroom home",
      inventory: "24 boxes, piano, Antique mirror",
      moveDate: "2026-08-14",
      origin: current.origin,
    });
  });

  it("validates document type and the 20 MB limit", () => {
    expect(intakeFileError(new File(["quote"], "quote.pdf"))).toBeUndefined();
    expect(intakeFileError(new File(["quote"], "quote.exe"))).toContain("PDF");
    expect(
      intakeFileError(
        new File([new Uint8Array(MAX_INTAKE_FILE_BYTES + 1)], "quote.pdf", {
          type: "application/pdf",
        }),
      ),
    ).toContain("20 MB");
  });

  it("formats provider confidence for the review state", () => {
    expect(extractionConfidenceLabel({ confidence: 0.936, facts: {} })).toBe(
      "94% extraction confidence",
    );
    expect(extractionConfidenceLabel(undefined)).toBe("Ready for your review");
  });
});
