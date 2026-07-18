import { describe, expect, it } from "vitest";

import {
  callOutcomeSchema,
  healthResponseSchema,
  jobSpecificationSchema,
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
});
