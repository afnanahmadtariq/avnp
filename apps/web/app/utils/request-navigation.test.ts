import { describe, expect, it } from "vitest";

import {
  isRequestStageAvailable,
  requestDestination,
  requestNextStage,
} from "./request-navigation";

const requestId = "RLY/A B";

describe("request navigation", () => {
  it.each([
    ["review_and_confirm", "review"],
    ["discover_businesses", "businesses"],
    ["approve_and_start", "businesses"],
    ["start_over", "businesses"],
    ["follow_run", "workspace"],
    ["resume_or_cancel", "workspace"],
    ["review_report", "report"],
  ])("maps %s to the canonical %s stage", (nextAction, stage) => {
    const job = { nextAction, publicId: requestId };

    expect(requestNextStage(job)).toBe(stage);
    expect(requestDestination(job)).toBe(`/requests/RLY%2FA%20B/${stage}`);
  });

  it("keeps completed-run workspace history available but gates future stages", () => {
    const reportReady = { nextAction: "review_report" };
    const needsReview = { nextAction: "review_and_confirm" };

    expect(isRequestStageAvailable(reportReady, "workspace")).toBe(true);
    expect(isRequestStageAvailable(reportReady, "report")).toBe(true);
    expect(isRequestStageAvailable(reportReady, "businesses")).toBe(false);
    expect(isRequestStageAvailable(needsReview, "review")).toBe(true);
    expect(isRequestStageAvailable(needsReview, "businesses")).toBe(false);
    expect(isRequestStageAvailable(needsReview, "workspace")).toBe(false);
    expect(isRequestStageAvailable(needsReview, "report")).toBe(false);
  });

  it("falls back to the safe brief stage for an unknown server action", () => {
    const job = { nextAction: "unknown_action", publicId: "RLY-UNKNOWN" };

    expect(requestNextStage(job)).toBe("review");
    expect(requestDestination(job)).toBe("/requests/RLY-UNKNOWN/review");
  });
});
