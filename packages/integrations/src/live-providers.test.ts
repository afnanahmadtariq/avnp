/*
 * Opt-in live provider smoke tests.
 *
 * Run exactly one provider at a time from the repository root:
 *   RELAY_LIVE_PROVIDER=google-places pnpm --filter @relay/integrations test:live
 *   RELAY_LIVE_PROVIDER=openai pnpm --filter @relay/integrations test:live
 *   RELAY_LIVE_PROVIDER=supabase-storage pnpm --filter @relay/integrations test:live
 *   RELAY_LIVE_PROVIDER=elevenlabs pnpm --filter @relay/integrations test:live
 *
 * The package script loads the root .env when it exists. Shell variables take
 * precedence, so CI can inject credentials without creating a file.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type { JobSpecification } from "@relay/contracts";

import { GooglePlacesBusinessDirectory } from "./google-places.js";
import { OpenAiResponsesExtractionProvider } from "./openai-extraction.js";
import type { ProviderRequestContext, ProviderResult } from "./result.js";
import { SupabaseEvidenceStorage } from "./supabase-storage.js";

const LIVE_PROVIDERS = [
  "elevenlabs",
  "google-places",
  "openai",
  "supabase-storage",
] as const;
type LiveProvider = (typeof LIVE_PROVIDERS)[number];

const SMOKE_BODY = new TextEncoder().encode("relay-storage-smoke\n");
const REQUEST_TIMEOUT_MILLISECONDS = 30_000;

function optionalEnvironmentValue(name: string): string | undefined {
  const value = Reflect.get(process.env, name);
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function requiredEnvironmentValue(name: string): string {
  const value = optionalEnvironmentValue(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value;
}

function selectLiveProvider(): LiveProvider | undefined {
  const value = optionalEnvironmentValue("RELAY_LIVE_PROVIDER");
  if (value === undefined) {
    return undefined;
  }
  if (!LIVE_PROVIDERS.some((provider) => provider === value)) {
    throw new Error(
      `RELAY_LIVE_PROVIDER must be one of: ${LIVE_PROVIDERS.join(", ")}.`,
    );
  }
  return value as LiveProvider;
}

const selectedProvider = selectLiveProvider();

function isSelected(provider: LiveProvider): boolean {
  return selectedProvider === provider;
}

function providerContext(provider: LiveProvider): ProviderRequestContext {
  const runId = randomUUID();
  return {
    deadlineAt: new Date(
      Date.now() + REQUEST_TIMEOUT_MILLISECONDS,
    ).toISOString(),
    requestId: `live-smoke-${provider}-${runId}`,
    traceId: `live-smoke-${runId}`,
  };
}

function requireProviderSuccess<Value>(
  result: ProviderResult<Value>,
  action: string,
): Value {
  if (!result.ok) {
    throw new Error(`${action} failed (${result.error.code}).`);
  }
  return result.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchWithoutProviderData(
  input: string,
  init: RequestInit,
  action: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(`${action} could not reach the provider.`);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`${action} was rejected (HTTP ${response.status}).`);
  }
  return response;
}

const googleFixture: JobSpecification = {
  bedrooms: 1,
  dropoffAddress: {
    formattedAddress: "Raleigh, NC 27601, USA",
  },
  dropoffStairs: 0,
  hasElevator: false,
  inventory: [{ name: "Small sofa", quantity: 1 }],
  movingDate: "2026-08-15",
  packingPreference: "none",
  pickupAddress: {
    coordinates: { latitude: 35.2271, longitude: -80.8431 },
    formattedAddress: "Charlotte, NC 28202, USA",
  },
  pickupStairs: 0,
  vertical: "moving",
};

test(
  "Google Places: returns at least one callable moving business",
  {
    skip: !isSelected("google-places"),
    timeout: REQUEST_TIMEOUT_MILLISECONDS + 5_000,
  },
  async () => {
    const provider = new GooglePlacesBusinessDirectory({
      apiKey: requiredEnvironmentValue("GOOGLE_PLACES_API_KEY"),
      regionCode: "US",
    });
    const businesses = requireProviderSuccess(
      await provider.search(
        { job: googleFixture, limit: 1, searchRadiusKm: 10 },
        providerContext("google-places"),
      ),
      "Google Places smoke search",
    );

    assert.ok(
      businesses.length > 0,
      "Google Places returned no callable business for the smoke fixture.",
    );
    assert.ok(
      businesses.every(
        (business) =>
          business.id.startsWith("google:") &&
          business.name.length > 0 &&
          /^\+[1-9]\d{7,14}$/.test(business.phone),
      ),
      "Google Places returned a business outside the Relay contract.",
    );
  },
);

test(
  "OpenAI: extracts a tiny moving brief with strict structured output",
  {
    skip: !isSelected("openai"),
    timeout: REQUEST_TIMEOUT_MILLISECONDS + 5_000,
  },
  async () => {
    const provider = new OpenAiResponsesExtractionProvider({
      apiKey: requiredEnvironmentValue("OPENAI_API_KEY"),
      maxOutputTokens: 1_024,
      maxTextCharacters: 500,
      model: requiredEnvironmentValue("OPENAI_MODEL"),
    });
    const extraction = requireProviderSuccess(
      await provider.extractJobSpecification(
        {
          input: {
            kind: "text",
            text: "Move one small sofa from Charlotte to Raleigh on 2026-08-15. One bedroom, no stairs, no elevator, and no packing.",
          },
        },
        providerContext("openai"),
      ),
      "OpenAI structured extraction smoke request",
    );

    assert.ok(
      extraction.facts.vertical === "moving" &&
        Number.isFinite(extraction.confidence) &&
        extraction.confidence >= 0 &&
        extraction.confidence <= 1 &&
        extraction.sourceSummary.length > 0 &&
        Array.isArray(extraction.warnings),
      "OpenAI returned an extraction outside the Relay contract.",
    );
  },
);

test(
  "Supabase Storage: writes, signs, reads, and always deletes a tiny object",
  {
    skip: !isSelected("supabase-storage"),
    timeout: REQUEST_TIMEOUT_MILLISECONDS * 2,
  },
  async () => {
    const provider = new SupabaseEvidenceStorage({
      bucket: requiredEnvironmentValue("SUPABASE_STORAGE_BUCKET"),
      serviceRoleKey: requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
      supabaseUrl: requiredEnvironmentValue("SUPABASE_URL"),
    });
    const context = providerContext("supabase-storage");
    const objectKey = `live-smoke/${randomUUID()}.txt`;
    let uploaded = false;

    try {
      const stored = requireProviderSuccess(
        await provider.put(
          {
            body: SMOKE_BODY,
            contentType: "text/plain",
            key: objectKey,
            metadata: { purpose: "live-smoke" },
            retentionUntil: new Date(Date.now() + 60_000).toISOString(),
          },
          context,
        ),
        "Supabase Storage smoke upload",
      );
      uploaded = true;
      assert.ok(
        stored.key === objectKey &&
          stored.contentLength === SMOKE_BODY.byteLength &&
          stored.contentType === "text/plain",
        "Supabase Storage returned upload metadata outside the Relay contract.",
      );

      const signedUrl = requireProviderSuccess(
        await provider.getSignedReadUrl(
          { expiresInSeconds: 60, key: objectKey },
          context,
        ),
        "Supabase Storage signed URL smoke request",
      );
      assert.ok(
        URL.canParse(signedUrl),
        "Supabase Storage returned a malformed signed URL.",
      );

      const readResponse = await fetchWithoutProviderData(
        signedUrl,
        {
          method: "GET",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        },
        "Supabase Storage signed read",
      );
      const downloaded = new Uint8Array(await readResponse.arrayBuffer());
      assert.ok(
        Buffer.from(downloaded).equals(Buffer.from(SMOKE_BODY)),
        "Supabase Storage signed read returned unexpected bytes.",
      );
    } finally {
      if (uploaded) {
        requireProviderSuccess(
          await provider.delete(objectKey, providerContext("supabase-storage")),
          "Supabase Storage smoke cleanup",
        );
      }
    }
  },
);

test(
  "ElevenLabs: reads agent and Twilio number configuration without starting a call",
  {
    skip: !isSelected("elevenlabs"),
    timeout: REQUEST_TIMEOUT_MILLISECONDS + 5_000,
  },
  async () => {
    const apiKey = requiredEnvironmentValue("ELEVENLABS_API_KEY");
    const negotiationAgentId = requiredEnvironmentValue("ELEVENLABS_AGENT_ID");
    const agentIds = [
      ...new Set([
        negotiationAgentId,
        optionalEnvironmentValue("ELEVENLABS_INTERVIEW_AGENT_ID") ??
          negotiationAgentId,
      ]),
    ];

    for (const agentId of agentIds) {
      const response = await fetchWithoutProviderData(
        `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`,
        {
          headers: { "xi-api-key": apiKey },
          method: "GET",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
        },
        "ElevenLabs agent configuration smoke request",
      );

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("ElevenLabs returned malformed agent configuration.");
      }
      assert.ok(
        isRecord(payload) &&
          payload.agent_id === agentId &&
          typeof payload.name === "string" &&
          payload.name.length > 0 &&
          isRecord(payload.conversation_config),
        "ElevenLabs returned agent configuration outside the expected contract.",
      );
    }

    const phoneNumberId = requiredEnvironmentValue(
      "ELEVENLABS_PHONE_NUMBER_ID",
    );
    const phoneResponse = await fetchWithoutProviderData(
      `https://api.elevenlabs.io/v1/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`,
      {
        headers: { "xi-api-key": apiKey },
        method: "GET",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      },
      "ElevenLabs phone number configuration smoke request",
    );
    let phonePayload: unknown;
    try {
      phonePayload = await phoneResponse.json();
    } catch {
      throw new Error(
        "ElevenLabs returned malformed phone number configuration.",
      );
    }
    assert.ok(
      isRecord(phonePayload) &&
        phonePayload.phone_number_id === phoneNumberId &&
        phonePayload.provider === "twilio" &&
        typeof phonePayload.phone_number === "string" &&
        /^\+[1-9]\d{7,14}$/u.test(phonePayload.phone_number),
      "ElevenLabs returned phone number configuration outside the expected Twilio contract.",
    );
  },
);
