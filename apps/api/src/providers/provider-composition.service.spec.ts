import type { RelayRuntimeConfig } from "@relay/runtime-config";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import { ProviderCompositionService } from "./provider-composition.service.js";

function runtimeConfig(
  overrides: Partial<RelayRuntimeConfig> = {},
): RelayRuntimeConfig {
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
    version: "0.0.0-test",
    ...overrides,
  };
}

function serviceFor(config: RelayRuntimeConfig): ProviderCompositionService {
  const runtime = { value: config } as RuntimeConfigService;
  return new ProviderCompositionService(runtime);
}

describe("ProviderCompositionService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("boots fixture mode without constructing paid providers", async () => {
    const service = serviceFor(runtimeConfig());

    expect(service.fixtureMode).toBe(true);
    expect(service.businessDirectory).toBeUndefined();
    expect(service.callProvider).toBeUndefined();
    expect(service.extractionProvider).toBeUndefined();
    expect(service.evidenceStorage).toBeUndefined();
    await expect(
      service.createSignedInterviewUrl({
        requestId: "request-local",
        traceId: "trace-local",
      }),
    ).resolves.toMatchObject({
      error: { code: "misconfigured" },
      ok: false,
    });
  });

  it("composes the selected production adapters without making requests", () => {
    const service = serviceFor(
      runtimeConfig({
        ai: {
          apiKey: "openai-secret",
          model: "gpt-5.6-luna",
          provider: "openai",
        },
        call: {
          agentId: "agent-1",
          apiKey: "elevenlabs-secret",
          phoneNumberId: "phone-1",
          provider: "elevenlabs",
          webhookSecret: "webhook-secret",
        },
        discovery: {
          googlePlacesApiKey: "places-secret",
          provider: "google",
        },
        mode: "live",
        storage: {
          bucket: "relay-evidence",
          provider: "supabase",
          serviceRoleKey: "supabase-secret",
          supabaseUrl: "https://project.supabase.co",
        },
      }),
    );

    expect(service.fixtureMode).toBe(false);
    expect(service.businessDirectory?.name).toBe("google-places");
    expect(service.callProvider?.name).toBe("elevenlabs-agents");
    expect(service.extractionProvider?.name).toBe("openai-responses");
    expect(service.evidenceStorage?.name).toBe("supabase-storage");
  });

  it("adds the configured provider deadline to request context", () => {
    const before = Date.now();
    const service = serviceFor(runtimeConfig({ providerTimeoutMs: 5_000 }));

    const context = service.createContext({
      requestId: "request-1",
      traceId: "trace-1",
    });

    expect(context.requestId).toBe("request-1");
    expect(context.traceId).toBe("trace-1");
    expect(Date.parse(context.deadlineAt ?? "")).toBeGreaterThanOrEqual(
      before + 5_000,
    );
  });

  it("creates a signed interview URL and fetches the finished transcript safely", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("get-signed-url")) {
        return new Response(
          JSON.stringify({
            signed_url:
              "wss://api.elevenlabs.io/v1/convai/conversation?conversation_signature=signed-token",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          conversation_id: "conversation-1",
          metadata: { start_time_unix_secs: 1_768_824_000 },
          status: "done",
          transcript: [
            { message: "What do you need?", role: "agent" },
            { message: "A two-bedroom move.", role: "user" },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const service = serviceFor(
      runtimeConfig({
        call: {
          agentId: "outbound-agent",
          apiKey: "elevenlabs-secret",
          interviewAgentId: "interview-agent",
          phoneNumberId: "phone-1",
          provider: "elevenlabs",
          webhookSecret: "webhook-secret",
        },
      }),
    );

    const signed = await service.createSignedInterviewUrl({
      requestId: "request-1",
      traceId: "trace-1",
    });
    const conversation = await service.fetchFinishedConversation(
      "conversation-1",
      { requestId: "request-2", traceId: "trace-2" },
    );

    expect(signed).toEqual({
      ok: true,
      value:
        "wss://api.elevenlabs.io/v1/convai/conversation?conversation_signature=signed-token",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "agent_id=interview-agent",
    );
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain(
      "elevenlabs-secret",
    );
    expect(conversation).toMatchObject({
      ok: true,
      value: {
        providerCallId: "conversation-1",
        status: "completed",
        transcriptText:
          "Agent: What do you need?\nBusiness: A two-bedroom move.",
      },
    });
  });
});
