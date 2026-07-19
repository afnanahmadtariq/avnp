import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, RuntimeConfigurationError } from "./index.js";

describe("loadRuntimeConfig", () => {
  it("uses credential-free providers outside production", () => {
    const config = loadRuntimeConfig({ NODE_ENV: "development" });

    expect(config.mode).toBe("fixture");
    expect(config.auth.provider).toBe("local");
    expect(config.queue.provider).toBe("memory");
    expect(config.discovery.provider).toBe("fixture");
    expect(config.call.provider).toBe("fixture");
    expect(config.ai.provider).toBe("fixture");
    expect(config.storage.provider).toBe("local");
  });

  it("fails closed when production configuration is incomplete", () => {
    expect(() => loadRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      RuntimeConfigurationError,
    );

    try {
      loadRuntimeConfig({ NODE_ENV: "production" });
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigurationError);
      expect((error as RuntimeConfigurationError).variables).toContain(
        "DATABASE_URL",
      );
      expect((error as RuntimeConfigurationError).message).not.toContain(
        "undefined",
      );
    }
  });

  it("accepts a complete live provider configuration", () => {
    const config = loadRuntimeConfig({
      AI_PROVIDER: "openai",
      API_PUBLIC_URL: "https://api.relay.example",
      AUTH_PROVIDER: "clerk",
      CALL_PROVIDER: "elevenlabs",
      CLERK_SECRET_KEY: "clerk-secret",
      CORS_ORIGINS: "https://relay.example",
      DATABASE_URL: "postgresql://relay:secret@db.example/relay",
      DISCOVERY_PROVIDER: "google",
      ELEVENLABS_AGENT_ID: "agent-id",
      ELEVENLABS_API_KEY: "elevenlabs-key",
      ELEVENLABS_PHONE_NUMBER_ID: "phone-id",
      ELEVENLABS_WEBHOOK_SECRET: "webhook-secret",
      GOOGLE_PLACES_API_KEY: "places-key",
      NODE_ENV: "production",
      NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
      OCR_PROVIDER: "openai",
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "gpt-5.6-luna",
      QUEUE_PROVIDER: "redis",
      REDIS_URL: "rediss://default:secret@redis.example:6379",
      STORAGE_PROVIDER: "supabase",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret",
      SUPABASE_STORAGE_BUCKET: "relay-evidence",
      SUPABASE_URL: "https://project.supabase.co",
    });

    expect(config.mode).toBe("live");
    expect(config.api.publicUrl).toBe("https://api.relay.example");
    expect(config.ai.model).toBe("gpt-5.6-luna");
  });

  it("allows an explicit fixture deployment without live credentials", () => {
    const config = loadRuntimeConfig({
      NODE_ENV: "production",
      RELAY_MODE: "fixture",
    });

    expect(config.mode).toBe("fixture");
  });

  it("rejects wildcard CORS in live mode", () => {
    expect(() =>
      loadRuntimeConfig({
        API_PUBLIC_URL: "https://api.relay.example",
        AUTH_PROVIDER: "local",
        CALL_PROVIDER: "fixture",
        CORS_ORIGINS: "*",
        DATABASE_URL: "postgresql://relay:secret@db.example/relay",
        DISCOVERY_PROVIDER: "fixture",
        NODE_ENV: "production",
        OCR_PROVIDER: "mock",
        QUEUE_PROVIDER: "memory",
        STORAGE_PROVIDER: "local",
        AI_PROVIDER: "fixture",
      }),
    ).toThrowError(/CORS_ORIGINS/);
  });
});
