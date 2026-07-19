import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { CallStatus } from "@relay/contracts";

import type {
  CallProvider,
  CallRecording,
  CallRecordingContentType,
  CallStatusSnapshot,
  StartedCall,
  StartCallRequest,
  VerifiedCallEvent,
} from "./calls.js";
import {
  encodePath,
  fetchProvider,
  isFiniteNumber,
  isRecord,
  isString,
  providerFailure,
  readJson,
  requestSignal,
  systemClock,
  type FetchLike,
  type ProviderClock,
} from "./http.js";
import type { ProviderRequestContext, ProviderResult } from "./result.js";

const PROVIDER_NAME = "elevenlabs-agents";
const DEFAULT_API_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_TWILIO_API_BASE_URL = "https://api.twilio.com/2010-04-01";
const DEFAULT_MAX_RECORDING_BYTES = 50 * 1_024 * 1_024;

export interface ElevenLabsCallConfig {
  readonly agentId: string;
  readonly agentPhoneNumberId: string;
  readonly apiBaseUrl?: string;
  readonly apiKey: string;
  readonly callRecordingEnabled?: boolean;
  readonly firstMessageOverride?: string;
  readonly maxRecordingBytes?: number;
  readonly promptOverride?: string;
  readonly signatureToleranceSeconds?: number;
  readonly twilioAccountSid?: string;
  readonly twilioApiBaseUrl?: string;
  readonly twilioAuthToken?: string;
  readonly webhookSecret: string;
}

export interface ElevenLabsCallDependencies {
  readonly clock?: ProviderClock;
  readonly fetch?: FetchLike;
}

interface ConversationRecord {
  readonly conversationId: string;
  readonly raw: Record<string, unknown>;
  readonly recordingUrl?: string;
  readonly status: CallStatus;
  readonly transcriptText?: string;
  readonly updatedAt: string;
}

function transcriptText(value: Record<string, unknown>): string | undefined {
  if (!Array.isArray(value.transcript)) {
    return undefined;
  }

  const turns: string[] = [];
  for (const turn of value.transcript) {
    if (!isRecord(turn) || !isString(turn.message)) {
      continue;
    }
    const role =
      turn.role === "agent"
        ? "Agent"
        : turn.role === "user"
          ? "Business"
          : undefined;
    const message = Array.from(turn.message)
      .filter((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return (
          codePoint === 9 ||
          codePoint === 10 ||
          codePoint === 13 ||
          (codePoint >= 32 && codePoint !== 127)
        );
      })
      .join("")
      .trim();
    if (role !== undefined && message.length > 0) {
      turns.push(`${role}: ${message}`);
    }
  }

  const transcript = turns.join("\n");
  return transcript.length === 0 ? undefined : transcript.slice(0, 200_000);
}

function conversationStatus(value: unknown): CallStatus | undefined {
  switch (value) {
    case "initiated":
      return "dialing";
    case "in-progress":
      return "negotiating";
    case "processing":
      return "in_progress";
    case "done":
      return "completed";
    case "failed":
      return "failed";
    default:
      return undefined;
  }
}

function headerValue(
  headers: Readonly<Record<string, readonly string[] | string | undefined>>,
  targetName: string,
): string | undefined {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === targetName.toLowerCase(),
  );
  const value = entry?.[1];
  return typeof value === "string" ? value : value?.[0];
}

function webhookStatus(event: Record<string, unknown>): CallStatus | undefined {
  const type = event.type;
  if (type === "call_initiation_failure") {
    return "failed";
  }
  if (type === "post_call_audio") {
    return "completed";
  }
  if (type !== "post_call_transcription") {
    return undefined;
  }

  const data = isRecord(event.data) ? event.data : undefined;
  return conversationStatus(data?.status) ?? "completed";
}

function eventConversationId(
  event: Record<string, unknown>,
): string | undefined {
  const data = isRecord(event.data) ? event.data : undefined;
  return isString(data?.conversation_id) && data.conversation_id.length > 0
    ? data.conversation_id
    : undefined;
}

function conversationUpdatedAt(
  value: Record<string, unknown>,
  fallback: Date,
): string {
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const startedAt = metadata?.start_time_unix_secs;
  const duration = metadata?.call_duration_secs;
  if (isFiniteNumber(startedAt)) {
    const durationSeconds = isFiniteNumber(duration)
      ? Math.max(0, duration)
      : 0;
    const calculated = new Date((startedAt + durationSeconds) * 1_000);
    if (Number.isFinite(calculated.getTime())) {
      return calculated.toISOString();
    }
  }

  return fallback.toISOString();
}

function twilioCallSid(value: Record<string, unknown>): string | undefined {
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const phoneCall = isRecord(metadata?.phone_call)
    ? metadata.phone_call
    : undefined;
  return isString(phoneCall?.call_sid) && phoneCall.call_sid.length > 0
    ? phoneCall.call_sid
    : undefined;
}

export class ElevenLabsTwilioCallProvider implements CallProvider {
  readonly name = PROVIDER_NAME;

  readonly #agentId: string;
  readonly #agentPhoneNumberId: string;
  readonly #apiBaseUrl: string;
  readonly #apiKey: string;
  readonly #callRecordingEnabled: boolean;
  readonly #clock: ProviderClock;
  readonly #fetch: FetchLike;
  readonly #firstMessageOverride: string | undefined;
  readonly #maxRecordingBytes: number;
  readonly #promptOverride: string | undefined;
  readonly #signatureToleranceSeconds: number;
  readonly #twilioAccountSid: string | undefined;
  readonly #twilioApiBaseUrl: string;
  readonly #twilioAuthToken: string | undefined;
  readonly #webhookSecret: string;
  readonly #twilioCallIds = new Map<string, string>();

  constructor(
    config: ElevenLabsCallConfig,
    dependencies: ElevenLabsCallDependencies = {},
  ) {
    this.#agentId = config.agentId.trim();
    this.#agentPhoneNumberId = config.agentPhoneNumberId.trim();
    this.#apiKey = config.apiKey.trim();
    this.#webhookSecret = config.webhookSecret.trim();
    this.#apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.#twilioApiBaseUrl = (
      config.twilioApiBaseUrl ?? DEFAULT_TWILIO_API_BASE_URL
    ).replace(/\/$/, "");
    this.#callRecordingEnabled = config.callRecordingEnabled ?? true;
    this.#firstMessageOverride = config.firstMessageOverride;
    this.#maxRecordingBytes = Math.max(
      1,
      Math.trunc(config.maxRecordingBytes ?? DEFAULT_MAX_RECORDING_BYTES),
    );
    this.#promptOverride = config.promptOverride;
    this.#signatureToleranceSeconds = Math.max(
      1,
      Math.trunc(config.signatureToleranceSeconds ?? 1_800),
    );
    this.#twilioAccountSid = config.twilioAccountSid?.trim();
    this.#twilioAuthToken = config.twilioAuthToken?.trim();
    this.#fetch = dependencies.fetch ?? fetch;
    this.#clock = dependencies.clock ?? systemClock;
  }

  async cancelCall(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<void>> {
    if (
      this.#twilioAccountSid === undefined ||
      this.#twilioAuthToken === undefined ||
      this.#twilioAccountSid.length === 0 ||
      this.#twilioAuthToken.length === 0
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Cancelling an active native Twilio call requires Twilio server credentials.",
        false,
      );
    }

    let callSid = this.#twilioCallIds.get(providerCallId);
    if (callSid === undefined) {
      const conversation = await this.#getConversation(providerCallId, context);
      if (!conversation.ok) {
        return conversation;
      }
      callSid = twilioCallSid(conversation.value.raw);
    }
    if (callSid === undefined) {
      return providerFailure(
        this.name,
        "invalid-response",
        "The ElevenLabs conversation did not include its Twilio call identifier.",
        false,
      );
    }

    const credentials = Buffer.from(
      `${this.#twilioAccountSid}:${this.#twilioAuthToken}`,
      "utf8",
    ).toString("base64");
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#twilioApiBaseUrl}/Accounts/${encodeURIComponent(this.#twilioAccountSid)}/Calls/${encodeURIComponent(callSid)}.json`,
      {
        body: new URLSearchParams({ Status: "completed" }),
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        method: "POST",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    this.#twilioCallIds.delete(providerCallId);
    return { ok: true, value: undefined };
  }

  async getCall(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<CallStatusSnapshot>> {
    const conversation = await this.#getConversation(providerCallId, context);
    if (!conversation.ok) {
      return conversation;
    }

    return {
      ok: true,
      value: {
        providerCallId: conversation.value.conversationId,
        ...(conversation.value.recordingUrl === undefined
          ? {}
          : { recordingUrl: conversation.value.recordingUrl }),
        status: conversation.value.status,
        ...(conversation.value.transcriptText === undefined
          ? {}
          : { transcriptText: conversation.value.transcriptText }),
        updatedAt: conversation.value.updatedAt,
      },
    };
  }

  async getRecording(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<CallRecording>> {
    const configurationFailure = this.#validateConfiguration(false);
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    if (providerCallId.trim().length === 0) {
      return providerFailure(
        this.name,
        "misconfigured",
        "ElevenLabs conversation identifier is required.",
        false,
      );
    }

    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#apiBaseUrl}/convai/conversations/${encodePath(providerCallId)}/audio`,
      {
        headers: { "xi-api-key": this.#apiKey },
        method: "GET",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const contentType = this.#recordingContentType(
      response.value.headers.get("content-type"),
    );
    const declaredLength = Number(
      response.value.headers.get("content-length") ?? Number.NaN,
    );
    if (
      contentType === undefined ||
      (Number.isFinite(declaredLength) &&
        declaredLength > this.#maxRecordingBytes)
    ) {
      await response.value.body?.cancel();
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs recording type or size is not accepted.",
        false,
      );
    }

    const body = response.value.body;
    if (body === null) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs returned an empty recording.",
        false,
      );
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let contentLength = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      contentLength += chunk.value.byteLength;
      if (contentLength > this.#maxRecordingBytes) {
        await reader.cancel();
        return providerFailure(
          this.name,
          "invalid-response",
          "ElevenLabs recording exceeded the configured size limit.",
          false,
        );
      }
      chunks.push(chunk.value);
    }
    if (contentLength === 0) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs returned an empty recording.",
        false,
      );
    }

    const recording = new Uint8Array(contentLength);
    let offset = 0;
    for (const chunk of chunks) {
      recording.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      value: {
        body: recording,
        contentLength,
        contentType,
        providerCallId,
      },
    };
  }

  async startCall(
    request: StartCallRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<StartedCall>> {
    const configurationFailure = this.#validateConfiguration(false);
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }

    const agentOverride = {
      ...(this.#firstMessageOverride === undefined
        ? {}
        : { first_message: this.#firstMessageOverride }),
      ...(this.#promptOverride === undefined
        ? {}
        : { prompt: { prompt: this.#promptOverride } }),
    };
    const body = {
      agent_id: this.#agentId,
      agent_phone_number_id: this.#agentPhoneNumberId,
      to_number: request.business.phone,
      call_recording_enabled: this.#callRecordingEnabled,
      conversation_initiation_client_data: {
        dynamic_variables: {
          relay_business_id: request.business.id,
          relay_business_name: request.business.name,
          relay_callback_url: request.callbackUrl,
          relay_identify_as_ai_when_asked:
            request.disclosure.identifyAsAiWhenAsked,
          relay_job_specification: JSON.stringify(request.job),
          relay_locale: request.locale,
          relay_negotiation_strategy: request.strategy,
          relay_recording_disclosure: request.disclosure.recordingDisclosure,
          relay_request_id: context.requestId,
          relay_trace_id: context.traceId,
        },
        ...(Object.keys(agentOverride).length === 0
          ? {}
          : { conversation_config_override: { agent: agentOverride } }),
      },
    };
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#apiBaseUrl}/convai/twilio/outbound-call`,
      {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.#apiKey,
        },
        method: "POST",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const decoded = await readJson(this.name, response.value);
    if (!decoded.ok) {
      return decoded;
    }
    if (
      !isRecord(decoded.value) ||
      decoded.value.success !== true ||
      !isString(decoded.value.conversation_id) ||
      decoded.value.conversation_id.length === 0
    ) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs did not return a conversation identifier.",
        false,
      );
    }

    const callSid = decoded.value.callSid;
    if (isString(callSid) && callSid.length > 0) {
      this.#twilioCallIds.set(decoded.value.conversation_id, callSid);
    }
    return {
      ok: true,
      value: {
        providerCallId: decoded.value.conversation_id,
        status: "queued",
        submittedAt: this.#clock().toISOString(),
      },
    };
  }

  async verifyWebhook(
    request: {
      readonly body: Uint8Array;
      readonly headers: Readonly<
        Record<string, readonly string[] | string | undefined>
      >;
    },
    context: ProviderRequestContext,
  ): Promise<ProviderResult<VerifiedCallEvent>> {
    void context;
    const configurationFailure = this.#validateConfiguration(true);
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }

    const signatureHeader = headerValue(
      request.headers,
      "elevenlabs-signature",
    );
    if (signatureHeader === undefined) {
      return providerFailure(
        this.name,
        "authentication",
        "ElevenLabs webhook signature is missing.",
        false,
      );
    }

    const parts = signatureHeader.split(",").map((part) => part.trim());
    const timestampText = parts.find((part) => part.startsWith("t="))?.slice(2);
    const signatures = parts
      .filter((part) => part.startsWith("v0="))
      .map((part) => part.slice(3));
    const timestamp = Number(timestampText);
    if (
      !Number.isSafeInteger(timestamp) ||
      signatures.length === 0 ||
      Math.abs(Math.floor(this.#clock().getTime() / 1_000) - timestamp) >
        this.#signatureToleranceSeconds
    ) {
      return providerFailure(
        this.name,
        "authentication",
        "ElevenLabs webhook signature is invalid or expired.",
        false,
      );
    }

    const rawBody = new TextDecoder().decode(request.body);
    const expected = createHmac("sha256", this.#webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest();
    const validSignature = signatures.some((signature) => {
      if (!/^[a-f\d]{64}$/i.test(signature)) {
        return false;
      }
      const candidate = Buffer.from(signature, "hex");
      return (
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected)
      );
    });
    if (!validSignature) {
      return providerFailure(
        this.name,
        "authentication",
        "ElevenLabs webhook signature is invalid or expired.",
        false,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs webhook body is malformed JSON.",
        false,
      );
    }
    if (!isRecord(parsed)) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs webhook body is invalid.",
        false,
      );
    }

    const providerCallId = eventConversationId(parsed);
    const status = webhookStatus(parsed);
    const eventTimestamp = parsed.event_timestamp;
    if (
      providerCallId === undefined ||
      status === undefined ||
      !isFiniteNumber(eventTimestamp)
    ) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs webhook event is unsupported or incomplete.",
        false,
      );
    }
    const occurredAt = new Date(eventTimestamp * 1_000);
    if (!Number.isFinite(occurredAt.getTime())) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs webhook event timestamp is invalid.",
        false,
      );
    }
    const data = isRecord(parsed.data) ? parsed.data : undefined;
    const extractedTranscript =
      data === undefined ? undefined : transcriptText(data);
    const hasRecording =
      parsed.type === "post_call_audio" || data?.has_audio === true;
    const recordingUrl = hasRecording
      ? `${this.#apiBaseUrl}/convai/conversations/${encodePath(providerCallId)}/audio`
      : undefined;

    const digest = createHash("sha256").update(request.body).digest("hex");
    return {
      ok: true,
      value: {
        eventId: `elevenlabs:${digest}`,
        occurredAt: occurredAt.toISOString(),
        providerCallId,
        ...(recordingUrl === undefined ? {} : { recordingUrl }),
        status,
        ...(extractedTranscript === undefined
          ? {}
          : { transcriptText: extractedTranscript }),
      },
    };
  }

  async #getConversation(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<ConversationRecord>> {
    const configurationFailure = this.#validateConfiguration(false);
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    if (providerCallId.trim().length === 0) {
      return providerFailure(
        this.name,
        "misconfigured",
        "ElevenLabs conversation identifier is required.",
        false,
      );
    }

    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#apiBaseUrl}/convai/conversations/${encodePath(providerCallId)}`,
      {
        headers: { "xi-api-key": this.#apiKey },
        method: "GET",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const decoded = await readJson(this.name, response.value);
    if (!decoded.ok) {
      return decoded;
    }
    if (!isRecord(decoded.value)) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs returned an invalid conversation payload.",
        false,
      );
    }

    const conversationId = decoded.value.conversation_id;
    const status = conversationStatus(decoded.value.status);
    if (!isString(conversationId) || status === undefined) {
      return providerFailure(
        this.name,
        "invalid-response",
        "ElevenLabs conversation status is incomplete.",
        false,
      );
    }

    const callSid = twilioCallSid(decoded.value);
    if (callSid !== undefined) {
      this.#twilioCallIds.set(conversationId, callSid);
    }
    const extractedTranscript = transcriptText(decoded.value);
    return {
      ok: true,
      value: {
        conversationId,
        raw: decoded.value,
        ...(decoded.value.has_audio === true
          ? {
              recordingUrl: `${this.#apiBaseUrl}/convai/conversations/${encodePath(conversationId)}/audio`,
            }
          : {}),
        status,
        ...(extractedTranscript === undefined
          ? {}
          : { transcriptText: extractedTranscript }),
        updatedAt: conversationUpdatedAt(decoded.value, this.#clock()),
      },
    };
  }

  #validateConfiguration(
    webhookOnly: boolean,
  ): ProviderResult<never> | undefined {
    const incompleteWebhook = this.#webhookSecret.length === 0;
    const incompleteApi =
      this.#apiKey.length === 0 ||
      this.#agentId.length === 0 ||
      this.#agentPhoneNumberId.length === 0 ||
      !URL.canParse(this.#apiBaseUrl);
    if (incompleteWebhook || (!webhookOnly && incompleteApi)) {
      return providerFailure(
        this.name,
        "misconfigured",
        "ElevenLabs call provider configuration is incomplete.",
        false,
      );
    }

    return undefined;
  }

  #recordingContentType(
    value: string | null,
  ): CallRecordingContentType | undefined {
    const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType === "audio/mpeg" || contentType === "audio/mp3") {
      return "audio/mpeg";
    }
    if (contentType === "audio/wav" || contentType === "audio/x-wav") {
      return "audio/wav";
    }
    return undefined;
  }
}
