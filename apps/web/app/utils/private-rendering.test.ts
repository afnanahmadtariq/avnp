import { describe, expect, it } from "vitest";

import config from "../../nuxt.config";

describe("private route rendering", () => {
  it.each([
    "/account",
    "/account/**",
    "/dashboard",
    "/profile",
    "/requests/**",
    "/settings",
    "/start",
  ])("keeps %s out of server-rendered private shells", (path) => {
    expect(config.routeRules?.[path]?.ssr).toBe(false);
    expect(config.routeRules?.[path]?.headers?.["x-robots-tag"]).toBe(
      "noindex, nofollow",
    );
  });

  it.each(["/privacy", "/support", "/terms"])(
    "prerenders public trust route %s",
    (path) => {
      expect(config.routeRules?.[path]?.prerender).toBe(true);
    },
  );
});
