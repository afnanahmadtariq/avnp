import { describe, expect, it } from "vitest";

import { relayApiErrorMessage } from "./useRelayApi";

describe("relayApiErrorMessage", () => {
  it("keeps actionable validation and conflict messages", () => {
    expect(
      relayApiErrorMessage({
        data: { message: "Confirm the brief before discovering businesses." },
        statusCode: 409,
      }),
    ).toBe("Confirm the brief before discovering businesses.");
  });

  it("does not expose provider or internal service details", () => {
    expect(
      relayApiErrorMessage({
        data: { message: "The voice provider returned an invalid response." },
        statusCode: 422,
      }),
    ).toBe(
      "Relay could not complete that step. Try again, or open Support if it continues.",
    );
    expect(
      relayApiErrorMessage({
        data: { message: "Prisma connection failed" },
        statusCode: 500,
      }),
    ).not.toContain("Prisma");
  });

  it("uses clear authentication and throttling recovery messages", () => {
    expect(relayApiErrorMessage({ statusCode: 401 })).toContain(
      "session expired",
    );
    expect(relayApiErrorMessage({ statusCode: 429 })).toContain(
      "Try again shortly",
    );
  });
});
