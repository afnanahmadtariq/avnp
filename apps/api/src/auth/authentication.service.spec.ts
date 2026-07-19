import type { RelayRuntimeConfig } from "@relay/runtime-config";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import { AuthenticationService } from "./authentication.service.js";

const clerk = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    authenticateRequest: clerk.authenticateRequest,
    users: { getUser: clerk.getUser },
  }),
}));

function localConfig(): RelayRuntimeConfig {
  return {
    ai: { apiKey: undefined, model: "gpt-5.6-luna", provider: "fixture" },
    api: {
      corsOrigins: ["http://localhost:3000"],
      host: "127.0.0.1",
      port: 4000,
      publicUrl: "http://localhost:4000",
    },
    auth: {
      clerkPublishableKey: undefined,
      clerkSecretKey: undefined,
      provider: "local",
    },
    call: {
      agentId: undefined,
      apiKey: undefined,
      phoneNumberId: undefined,
      provider: "fixture",
      webhookSecret: undefined,
    },
    databaseUrl: undefined,
    discovery: { googlePlacesApiKey: undefined, provider: "fixture" },
    document: { provider: "mock" },
    environment: "test",
    mode: "fixture",
    providerTimeoutMs: 20_000,
    queue: { provider: "memory", redisUrl: undefined },
    storage: {
      bucket: "relay-evidence",
      provider: "local",
      serviceRoleKey: undefined,
      supabaseUrl: undefined,
    },
    version: "test",
  };
}

describe("AuthenticationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provides the deterministic development identity without credentials", async () => {
    const service = new AuthenticationService({
      value: localConfig(),
    } as RuntimeConfigService);

    await expect(service.authenticate({ headers: {} })).resolves.toEqual(
      expect.objectContaining({ provider: "local", subject: "demo-user" }),
    );
  });

  it("hydrates missing default session claims from the verified Clerk user", async () => {
    const config: RelayRuntimeConfig = {
      ...localConfig(),
      auth: {
        clerkPublishableKey: "pk_test_relay",
        clerkSecretKey: "sk_test_relay",
        provider: "clerk",
      },
    };
    clerk.authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({
        sessionClaims: {},
        userId: "user_relay",
      }),
    });
    clerk.getUser.mockResolvedValue({
      firstName: "Afnan",
      fullName: "Afnan Tariq",
      lastName: "Tariq",
      primaryEmailAddress: { emailAddress: "afnan@example.com" },
      username: null,
    });
    const service = new AuthenticationService({
      value: config,
    } as RuntimeConfigService);
    const request = {
      headers: { host: "api.zerotools.online" },
      method: "GET",
      originalUrl: "/api/v1/profile",
      protocol: "https",
    };

    await expect(service.authenticate(request)).resolves.toEqual({
      displayName: "Afnan Tariq",
      email: "afnan@example.com",
      provider: "clerk",
      subject: "user_relay",
    });
    await service.authenticate(request);

    expect(clerk.getUser).toHaveBeenCalledTimes(1);
  });
});
