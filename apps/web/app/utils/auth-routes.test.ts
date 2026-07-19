import { describe, expect, it } from "vitest";

import { isLegacyDemoRequestRoute, isPublicAppRoute } from "./auth-routes";

describe("authentication routes", () => {
  it.each([
    "/",
    "/privacy",
    "/privacy/",
    "/sign-in",
    "/sign-in/sso-callback",
    "/sign-up",
    "/sign-up/continue",
    "/support",
    "/support/",
    "/terms",
    "/terms/",
  ])("allows Clerk to finish on %s", (path) => {
    expect(isPublicAppRoute(path)).toBe(true);
  });

  it.each([
    "/dashboard",
    "/privacy/archive",
    "/profile",
    "/requests/RLY-1/review",
    "/support/archive",
    "/terms/archive",
  ])("keeps %s protected", (path) => {
    expect(isPublicAppRoute(path)).toBe(false);
  });

  it("recognizes only the retired production demo request route", () => {
    expect(isLegacyDemoRequestRoute("/requests/RLY-2048/review")).toBe(true);
    expect(isLegacyDemoRequestRoute("/requests/RLY-BD2E9FEE/review")).toBe(
      false,
    );
  });
});
