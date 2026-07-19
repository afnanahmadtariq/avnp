import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import type { Business, JobSpecification } from "@relay/contracts";

import { ElevenLabsTwilioCallProvider } from "./elevenlabs.js";
import { GooglePlacesBusinessDirectory } from "./google-places.js";
import type { FetchLike } from "./http.js";
import { OpenAiResponsesExtractionProvider } from "./openai-extraction.js";
import type { ProviderRequestContext } from "./result.js";
import { SupabaseEvidenceStorage } from "./supabase-storage.js";

const now = new Date("2026-07-19T10:00:00.000Z");
const clock = () => new Date(now);
const context: ProviderRequestContext = {
  requestId: "request-1",
  traceId: "trace-1",
};
const job: JobSpecification = {
  vertical: "moving",
  pickupAddress: {
    formattedAddress: "100 Main St, Charlotte, NC 28202, USA",
    coordinates: { latitude: 35.2271, longitude: -80.8431 },
  },
  dropoffAddress: {
    formattedAddress: "200 Oak St, Raleigh, NC 27601, USA",
  },
  movingDate: "2026-08-15",
  bedrooms: 2,
  pickupStairs: 1,
  dropoffStairs: 0,
  hasElevator: false,
  inventory: [{ name: "Sofa", quantity: 1 }],
  packingPreference: "partial",
};
const business: Business = {
  id: "business-1",
  location: { formattedAddress: "1 Pine St, Charlotte, NC 28202, USA" },
  name: "Pine & Co. Moving",
  phone: "+17045550101",
  source: "directory",
};

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json", ...init.headers },
    status: init.status ?? 200,
  });
}

function requestBody(init: RequestInit | undefined): Record<string, unknown> {
  const body = init?.body;
  assert.equal(typeof body, "string");
  if (typeof body !== "string") {
    throw new TypeError("Expected a JSON string request body");
  }
  const parsed = JSON.parse(body) as unknown;
  assert.ok(typeof parsed === "object" && parsed !== null);
  return parsed as Record<string, unknown>;
}

function openAiResponse(output: unknown): Response {
  return jsonResponse({
    output: [
      {
        content: [{ text: JSON.stringify(output), type: "output_text" }],
        role: "assistant",
        status: "completed",
        type: "message",
      },
    ],
    status: "completed",
  });
}

describe("GooglePlacesBusinessDirectory", () => {
  it("uses Text Search field masks and maps callable businesses", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    let capturedHeaders: Headers | undefined;
    const fetcher: FetchLike = async (input, init) => {
      assert.equal(String(input), "https://places.test/v1/places:searchText");
      capturedBody = requestBody(init);
      capturedHeaders = new Headers(init?.headers);
      return jsonResponse({
        places: [
          {
            displayName: { languageCode: "en", text: "Pine Movers" },
            formattedAddress: "1 Pine St, Charlotte, NC 28202, USA",
            id: "place-1",
            internationalPhoneNumber: "+1 704-555-0101",
            location: { latitude: 35.2, longitude: -80.8 },
            postalAddress: {
              addressLines: ["1 Pine St"],
              administrativeArea: "NC",
              locality: "Charlotte",
              postalCode: "28202",
              regionCode: "US",
            },
            rating: 4.8,
            types: ["moving_company", "point_of_interest"],
            userRatingCount: 214,
            websiteUri: "https://pine.example/",
          },
          {
            displayName: { text: "No Phone Movers" },
            formattedAddress: "2 Pine St",
            id: "place-2",
          },
        ],
        routingSummaries: [{ distanceMeters: 1_234 }, {}],
      });
    };
    const provider = new GooglePlacesBusinessDirectory(
      {
        apiBaseUrl: "https://places.test/v1",
        apiKey: "places-secret",
        regionCode: "US",
      },
      { clock, fetch: fetcher },
    );

    const result = await provider.search(
      { job, limit: 5, searchRadiusKm: 25 },
      context,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.length, 1);
    assert.deepEqual(result.value[0], {
      categories: ["moving_company", "point_of_interest"],
      distanceMeters: 1_234,
      externalId: "place-1",
      id: "google:place-1",
      location: {
        city: "Charlotte",
        coordinates: { latitude: 35.2, longitude: -80.8 },
        countryCode: "US",
        formattedAddress: "1 Pine St, Charlotte, NC 28202, USA",
        line1: "1 Pine St",
        placeId: "place-1",
        postalCode: "28202",
        region: "NC",
      },
      name: "Pine Movers",
      phone: "+17045550101",
      rating: 4.8,
      reviewCount: 214,
      source: "directory",
      websiteUrl: "https://pine.example/",
    });
    assert.equal(capturedBody?.maxResultCount, 5);
    assert.deepEqual(capturedBody?.routingParameters, {
      origin: { latitude: 35.2271, longitude: -80.8431 },
    });
    assert.equal(capturedHeaders?.get("x-goog-api-key"), "places-secret");
    assert.match(
      capturedHeaders?.get("x-goog-fieldmask") ?? "",
      /routingSummaries\.distanceMeters/,
    );
  });
});

describe("ElevenLabsTwilioCallProvider", () => {
  it("starts, reads, and cancels a native Twilio call", async () => {
    const requests: { readonly init?: RequestInit; readonly url: string }[] =
      [];
    const fetcher: FetchLike = async (input, init) => {
      const url = String(input);
      requests.push({ ...(init === undefined ? {} : { init }), url });
      if (url.endsWith("/convai/twilio/outbound-call")) {
        return jsonResponse({
          callSid: "CA123",
          conversation_id: "conv-123",
          message: "started",
          success: true,
        });
      }
      if (url.endsWith("/convai/conversations/conv-123")) {
        return jsonResponse({
          conversation_id: "conv-123",
          has_audio: true,
          metadata: {
            call_duration_secs: 120,
            phone_call: { call_sid: "CA123", type: "twilio" },
            start_time_unix_secs: 1_753_000_000,
          },
          status: "done",
          transcript: [
            { message: "Hello.\u0000", role: "agent" },
            { message: "Please quote this move.", role: "user" },
          ],
        });
      }
      if (url.endsWith("/convai/conversations/conv-123/audio")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            "Content-Length": "3",
            "Content-Type": "audio/mpeg",
          },
          status: 200,
        });
      }
      assert.match(url, /Accounts\/AC123\/Calls\/CA123\.json$/);
      return jsonResponse({ sid: "CA123", status: "completed" });
    };
    const provider = new ElevenLabsTwilioCallProvider(
      {
        agentId: "agent-1",
        agentPhoneNumberId: "phone-1",
        apiBaseUrl: "https://eleven.test/v1",
        apiKey: "eleven-secret",
        twilioAccountSid: "AC123",
        twilioApiBaseUrl: "https://twilio.test/2010-04-01",
        twilioAuthToken: "twilio-secret",
        webhookSecret: "webhook-secret",
      },
      { clock, fetch: fetcher },
    );

    const started = await provider.startCall(
      {
        business,
        callbackUrl: "https://relay.example/webhooks/elevenlabs",
        disclosure: {
          identifyAsAiWhenAsked: true,
          recordingDisclosure: "This call may be recorded.",
        },
        job,
        locale: "en-US",
        representedAs: "Afnan",
        strategy: "fee_removal",
        truthfulLeverage: {
          competingBusinessName: "Carolina Transit",
          competingQuoteAmountMinor: 184_000,
          competingQuoteId: "quote-competing",
          currency: "USD",
          currentQuoteAmountMinor: 221_000,
          currentQuoteId: "quote-current",
        },
      },
      context,
    );
    assert.deepEqual(started, {
      ok: true,
      value: {
        providerCallId: "conv-123",
        status: "queued",
        submittedAt: now.toISOString(),
      },
    });
    const startBody = requestBody(requests[0]?.init);
    assert.equal(startBody.agent_id, "agent-1");
    assert.equal(startBody.to_number, business.phone);
    const initiation = startBody.conversation_initiation_client_data;
    assert.ok(typeof initiation === "object" && initiation !== null);
    const variables = (initiation as Record<string, unknown>).dynamic_variables;
    assert.ok(typeof variables === "object" && variables !== null);
    assert.equal(
      (variables as Record<string, unknown>).relay_negotiation_strategy,
      "fee_removal",
    );
    assert.deepEqual(variables, {
      relay_business_id: "business-1",
      relay_business_name: "Pine & Co. Moving",
      relay_callback_url: "https://relay.example/webhooks/elevenlabs",
      relay_competing_business_name: "Carolina Transit",
      relay_competing_quote_amount: "1840.00",
      relay_competing_quote_id: "quote-competing",
      relay_current_quote_amount: "2210.00",
      relay_current_quote_id: "quote-current",
      relay_identify_as_ai_when_asked: true,
      relay_is_follow_up: true,
      relay_job_specification: JSON.stringify(job),
      relay_locale: "en-US",
      relay_negotiation_strategy: "fee_removal",
      relay_quote_currency: "USD",
      relay_recording_disclosure: "This call may be recorded.",
      relay_represented_as: "Afnan",
      relay_request_id: "request-1",
      relay_trace_id: "trace-1",
    });

    const snapshot = await provider.getCall("conv-123", context);
    assert.equal(snapshot.ok, true);
    if (snapshot.ok) {
      assert.equal(snapshot.value.status, "completed");
      assert.equal(snapshot.value.providerCallId, "conv-123");
      assert.equal(
        snapshot.value.recordingUrl,
        "https://eleven.test/v1/convai/conversations/conv-123/audio",
      );
      assert.equal(
        snapshot.value.transcriptText,
        "Agent: Hello.\nBusiness: Please quote this move.",
      );
    }

    const recording = await provider.getRecording("conv-123", context);
    assert.equal(recording.ok, true);
    if (recording.ok) {
      assert.equal(recording.value.contentType, "audio/mpeg");
      assert.equal(recording.value.contentLength, 3);
      assert.deepEqual([...recording.value.body], [1, 2, 3]);
    }

    const cancelled = await provider.cancelCall("conv-123", context);
    assert.deepEqual(cancelled, { ok: true, value: undefined });
    assert.equal(requests[3]?.init?.method, "POST");
    assert.equal(String(requests[3]?.init?.body), "Status=completed");
    assert.match(
      new Headers(requests[3]?.init?.headers).get("authorization") ?? "",
      /^Basic /,
    );
  });

  it("rejects recordings above the configured size cap", async () => {
    const fetcher: FetchLike = async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Length": "3",
          "Content-Type": "audio/mpeg",
        },
      });
    const provider = new ElevenLabsTwilioCallProvider(
      {
        agentId: "agent-1",
        agentPhoneNumberId: "phone-1",
        apiKey: "eleven-secret",
        maxRecordingBytes: 2,
        webhookSecret: "webhook-secret",
      },
      { clock, fetch: fetcher },
    );

    const result = await provider.getRecording("conv-123", context);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "invalid-response");
    }
  });

  it("verifies HMAC signatures and rejects replayed webhooks", async () => {
    const provider = new ElevenLabsTwilioCallProvider(
      {
        agentId: "agent-1",
        agentPhoneNumberId: "phone-1",
        apiKey: "eleven-secret",
        webhookSecret: "webhook-secret",
      },
      { clock },
    );
    const timestamp = Math.floor(now.getTime() / 1_000);
    const bodyText = JSON.stringify({
      data: {
        conversation_id: "conv-123",
        has_audio: true,
        status: "done",
        transcript: [{ message: "The total is $1,840.", role: "user" }],
      },
      event_timestamp: timestamp,
      type: "post_call_transcription",
    });
    const body = new TextEncoder().encode(bodyText);
    const signature = createHmac("sha256", "webhook-secret")
      .update(`${timestamp}.${bodyText}`)
      .digest("hex");

    const verified = await provider.verifyWebhook(
      {
        body,
        headers: {
          "ElevenLabs-Signature": `t=${timestamp},v0=${signature}`,
        },
      },
      context,
    );
    assert.equal(verified.ok, true);
    if (verified.ok) {
      assert.equal(verified.value.providerCallId, "conv-123");
      assert.equal(verified.value.status, "completed");
      assert.match(verified.value.eventId, /^elevenlabs:[a-f\d]{64}$/);
      assert.equal(
        verified.value.recordingUrl,
        "https://api.elevenlabs.io/v1/convai/conversations/conv-123/audio",
      );
      assert.equal(
        verified.value.transcriptText,
        "Business: The total is $1,840.",
      );
    }

    const replayed = await provider.verifyWebhook(
      {
        body,
        headers: {
          "elevenlabs-signature": `t=${timestamp - 2_000},v0=${signature}`,
        },
      },
      context,
    );
    assert.equal(replayed.ok, false);
    if (!replayed.ok) {
      assert.equal(replayed.error.code, "authentication");
    }
  });
});

describe("SupabaseEvidenceStorage", () => {
  it("uploads private evidence, signs reads, and deletes through Storage API", async () => {
    const requests: { readonly init?: RequestInit; readonly url: string }[] =
      [];
    const fetcher: FetchLike = async (input, init) => {
      const url = String(input);
      requests.push({ ...(init === undefined ? {} : { init }), url });
      if (url.includes("/object/sign/")) {
        return jsonResponse({
          signedURL: "/object/sign/evidence/runs/1/transcript.txt?token=token",
        });
      }
      if (init?.method === "DELETE") {
        return new Response(null, { status: 200 });
      }
      return jsonResponse(
        { Id: "object-1", Key: "evidence/runs/1/transcript.txt" },
        { headers: { etag: '"etag-1"' } },
      );
    };
    const provider = new SupabaseEvidenceStorage(
      {
        bucket: "evidence",
        serviceRoleKey: "service-secret",
        supabaseUrl: "https://project.supabase.co",
      },
      { clock, fetch: fetcher },
    );
    const body = new TextEncoder().encode("transcript");

    const stored = await provider.put(
      {
        body,
        contentType: "text/plain",
        key: "runs/1/transcript.txt",
        metadata: { run_id: "run-1" },
        retentionUntil: "2026-08-19T10:00:00.000Z",
      },
      context,
    );
    assert.deepEqual(stored, {
      ok: true,
      value: {
        contentLength: body.byteLength,
        contentType: "text/plain",
        etag: '"etag-1"',
        key: "runs/1/transcript.txt",
      },
    });
    const uploadHeaders = new Headers(requests[0]?.init?.headers);
    assert.equal(uploadHeaders.get("authorization"), "Bearer service-secret");
    assert.equal(uploadHeaders.get("x-upsert"), "false");
    const metadata = JSON.parse(
      Buffer.from(uploadHeaders.get("x-metadata") ?? "", "base64").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    assert.deepEqual(metadata, {
      retention_until: "2026-08-19T10:00:00.000Z",
      run_id: "run-1",
    });

    const signed = await provider.getSignedReadUrl(
      { expiresInSeconds: 300, key: "runs/1/transcript.txt" },
      context,
    );
    assert.deepEqual(signed, {
      ok: true,
      value:
        "https://project.supabase.co/storage/v1/object/sign/evidence/runs/1/transcript.txt?token=token",
    });
    assert.deepEqual(requestBody(requests[1]?.init), { expiresIn: 300 });

    const deleted = await provider.delete("runs/1/transcript.txt", context);
    assert.deepEqual(deleted, { ok: true, value: undefined });
    assert.deepEqual(requestBody(requests[2]?.init), {
      prefixes: ["runs/1/transcript.txt"],
    });
  });
});

describe("OpenAiResponsesExtractionProvider", () => {
  it("extracts moving facts from a PDF with a strict Responses schema", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetcher: FetchLike = async (_input, init) => {
      capturedBody = requestBody(init);
      return openAiResponse({
        confidence: 0.91,
        facts: {
          bedrooms: 2,
          dropoffAddress: "200 Oak St, Raleigh, NC 27601",
          dropoffStairs: 0,
          hasElevator: false,
          inventory: [
            {
              name: "Sofa",
              notes: null,
              quantity: 1,
              specialHandling: false,
            },
          ],
          movingDate: "2026-08-15",
          notes: null,
          packingPreference: "partial",
          pickupAddress: "100 Main St, Charlotte, NC 28202",
          pickupStairs: 1,
          specialItems: [],
        },
        sourceSummary: "Two-bedroom local move inventory sheet.",
        warnings: ["Elevator access was not independently verified."],
      });
    };
    const provider = new OpenAiResponsesExtractionProvider(
      {
        apiBaseUrl: "https://openai.test/v1",
        apiKey: "openai-secret",
        model: "model-snapshot",
      },
      { clock, fetch: fetcher },
    );

    const result = await provider.extractJobSpecification(
      {
        input: {
          body: new TextEncoder().encode("%PDF fixture"),
          contentType: "application/pdf",
          filename: "inventory.pdf",
          kind: "file",
        },
      },
      context,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.facts.vertical, "moving");
      assert.equal(result.value.facts.bedrooms, 2);
      assert.equal(result.value.facts.inventory?.[0]?.name, "Sofa");
    }
    assert.equal(capturedBody?.store, false);
    assert.equal(capturedBody?.model, "model-snapshot");
    const text = capturedBody?.text as Record<string, unknown>;
    const format = text.format as Record<string, unknown>;
    assert.equal(format.type, "json_schema");
    assert.equal(format.strict, true);
    const input = capturedBody?.input as Record<string, unknown>[];
    const content = input[0]?.content as Record<string, unknown>[];
    assert.equal(content[1]?.type, "input_file");
    assert.match(
      String(content[1]?.file_data),
      /^data:application\/pdf;base64,/,
    );
  });

  it("constructs and validates a comparable quote from structured output", async () => {
    const fetcher: FetchLike = async () =>
      openAiResponse({
        basePrice: { amountMinor: 180_000, currency: "USD" },
        completeness: 0.96,
        confidence: 0.94,
        discount: { amountMinor: 10_000, currency: "USD" },
        estimatedHours: 5.5,
        estimateType: "binding",
        fees: [
          {
            amount: { amountMinor: 14_000, currency: "USD" },
            category: "transportation",
            code: "fuel",
            disclosed: true,
            includedInTotal: true,
            label: "Fuel and mileage",
            required: true,
          },
        ],
        hourlyRate: null,
        minimumHours: null,
        priceRange: null,
        pricingModel: "fixed",
        sourceSummary: "Dispatcher confirmed a binding total and deposit.",
        tax: null,
        terms: {
          additionalNotes: ["Arrival window 8–9 AM"],
          cancellationPolicy: "Cancel 48 hours before the move.",
          deposit: { amountMinor: 36_800, currency: "USD" },
          insuranceIncluded: true,
          packingIncluded: true,
        },
        totalPrice: { amountMinor: 184_000, currency: "USD" },
        validUntil: "2026-08-01T00:00:00.000Z",
        warnings: [],
      });
    const provider = new OpenAiResponsesExtractionProvider(
      {
        apiKey: "openai-secret",
        model: "model-snapshot",
      },
      { clock, fetch: fetcher },
    );

    const result = await provider.extractQuote(
      {
        businessId: business.id,
        defaultCurrency: "USD",
        input: {
          kind: "text",
          text: "The binding total is $1,840 including $140 fuel.",
        },
        jobId: "job-1",
        quoteId: "quote-1",
      },
      context,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.quote.totalPrice.amountMinor, 184_000);
    assert.equal(result.value.quote.fees[0]?.category, "transportation");
    assert.equal(result.value.quote.terms?.deposit?.amountMinor, 36_800);
    assert.equal(result.value.quote.capturedAt, now.toISOString());
    assert.equal(result.value.quote.validUntil, "2026-08-01T00:00:00.000Z");
  });
});
