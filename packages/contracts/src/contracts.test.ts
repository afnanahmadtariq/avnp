import { describe, expect, it } from "vitest";

import {
  callOutcomeSchema,
  jobSummarySchema,
  healthResponseSchema,
  jobSpecificationSchema,
  saveDecisionRequestSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("accepts a healthy service response", () => {
    expect(
      healthResponseSchema.parse({
        service: "api",
        status: "ok",
        timestamp: "2026-07-19T00:00:00.000Z",
        version: "0.0.0",
      }),
    ).toMatchObject({ service: "api", status: "ok" });
  });

  it("rejects an incomplete moving specification", () => {
    const result = jobSpecificationSchema.safeParse({
      vertical: "moving",
      bedrooms: 2,
    });

    expect(result.success).toBe(false);
  });

  it("preserves callback as a structured call outcome", () => {
    const result = callOutcomeSchema.parse({
      businessId: "business_1",
      callId: "call_1",
      callbackAt: "2026-07-20T14:00:00.000Z",
      durationSeconds: 90,
      endedAt: "2026-07-19T12:01:30.000Z",
      jobId: "job_1",
      outcome: "callback_requested",
      startedAt: "2026-07-19T12:00:00.000Z",
    });

    expect(result.outcome).toBe("callback_requested");
  });

  it("accepts an API-facing job summary", () => {
    expect(
      jobSummarySchema.parse({
        candidateCount: 3,
        createdAt: "2026-07-19T00:00:00.000Z",
        id: "job_1",
        latestRun: {
          id: "run_1",
          status: "completed",
          updatedAt: "2026-07-19T00:20:00.000Z",
        },
        publicId: "RLY-2048",
        quoteCount: 3,
        status: "completed",
        title: "Charlotte apartment move",
        updatedAt: "2026-07-19T00:20:00.000Z",
        vertical: "moving",
      }),
    ).toMatchObject({
      publicId: "RLY-2048",
      title: "Charlotte apartment move",
    });
  });

  it("requires a selected quote for a quote-selected decision", () => {
    expect(
      saveDecisionRequestSchema.safeParse({
        outcome: "quote_selected",
        selectedQuoteId: null,
      }).success,
    ).toBe(false);
  });
});
