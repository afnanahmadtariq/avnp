import type { RelayRuntimeConfig } from "@relay/runtime-config";
import { describe, expect, it } from "vitest";

import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import { AuthenticationService } from "./authentication.service.js";

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
  it("provides the deterministic development identity without credentials", async () => {
    const service = new AuthenticationService({
      value: localConfig(),
    } as RuntimeConfigService);

    await expect(service.authenticate({ headers: {} })).resolves.toEqual(
      expect.objectContaining({ provider: "local", subject: "demo-user" }),
    );
  });
});
