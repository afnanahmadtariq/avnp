import { Injectable } from "@nestjs/common";
import {
  ElevenLabsTwilioCallProvider,
  GooglePlacesBusinessDirectory,
  OpenAiResponsesExtractionProvider,
  SupabaseEvidenceStorage,
  type BusinessDirectoryProvider,
  type CallStatusSnapshot,
  type CallProvider,
  type EvidenceStorageProvider,
  type ProviderRequestContext,
  type ProviderResult,
  type StructuredExtractionProvider,
} from "@relay/integrations";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RuntimeConfigService } from "../config/runtime-config.service.js";

export interface ProviderContextInput {
  readonly requestId: string;
  readonly signal?: AbortSignal;
  readonly traceId: string;
}

/**
 * Owns the process-wide live provider clients. Fixture mode intentionally
 * leaves paid providers absent so local development can boot without secrets.
 */
@Injectable()
export class ProviderCompositionService {
  readonly businessDirectory: BusinessDirectoryProvider | undefined;
  readonly callProvider: CallProvider | undefined;
  readonly evidenceStorage: EvidenceStorageProvider | undefined;
  readonly extractionProvider: StructuredExtractionProvider | undefined;
  readonly fixtureMode: boolean;

  constructor(private readonly runtimeConfig: RuntimeConfigService) {
    const config = runtimeConfig.value;
    this.fixtureMode = config.mode === "fixture";

    this.businessDirectory =
      config.discovery.provider === "google"
        ? new GooglePlacesBusinessDirectory({
            apiKey: config.discovery.googlePlacesApiKey ?? "",
          })
        : undefined;
    this.callProvider =
      config.call.provider === "elevenlabs"
        ? new ElevenLabsTwilioCallProvider({
            agentId: config.call.agentId ?? "",
            agentPhoneNumberId: config.call.phoneNumberId ?? "",
            apiKey: config.call.apiKey ?? "",
            ...(config.call.twilioAccountSid === undefined
              ? {}
              : { twilioAccountSid: config.call.twilioAccountSid }),
            ...(config.call.twilioAuthToken === undefined
              ? {}
              : { twilioAuthToken: config.call.twilioAuthToken }),
            webhookSecret: config.call.webhookSecret ?? "",
          })
        : undefined;
    this.extractionProvider =
      config.ai.provider === "openai"
        ? new OpenAiResponsesExtractionProvider({
            apiKey: config.ai.apiKey ?? "",
            model: config.ai.model,
          })
        : undefined;
    this.evidenceStorage =
      config.storage.provider === "supabase"
        ? new SupabaseEvidenceStorage({
            bucket: config.storage.bucket,
            serviceRoleKey: config.storage.serviceRoleKey ?? "",
            supabaseUrl: config.storage.supabaseUrl ?? "",
          })
        : undefined;
  }

  getBusinessDirectory(): BusinessDirectoryProvider | undefined {
    return this.businessDirectory;
  }

  getCallProvider(): CallProvider | undefined {
    return this.callProvider;
  }

  getEvidenceStorage(): EvidenceStorageProvider | undefined {
    return this.evidenceStorage;
  }

  getExtractionProvider(): StructuredExtractionProvider | undefined {
    return this.extractionProvider;
  }

  createContext(input: ProviderContextInput): ProviderRequestContext {
    return {
      deadlineAt: new Date(
        Date.now() + this.runtimeConfig.value.providerTimeoutMs,
      ).toISOString(),
      requestId: input.requestId,
      traceId: input.traceId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    };
  }

  async createSignedInterviewUrl(
    input: ProviderContextInput,
  ): Promise<ProviderResult<string>> {
    const config = this.runtimeConfig.value;
    const provider = this.callProvider?.name ?? "elevenlabs-agents";
    const agentId = config.call.interviewAgentId ?? config.call.agentId;
    const apiKey = config.call.apiKey;

    if (
      config.call.provider !== "elevenlabs" ||
      agentId === undefined ||
      apiKey === undefined
    ) {
      return {
        error: {
          code: "misconfigured",
          message: "The ElevenLabs interview session is not configured.",
          provider,
          retryable: false,
        },
        ok: false,
      };
    }

    const timeoutSignal = AbortSignal.timeout(config.providerTimeoutMs);
    const signal =
      input.signal === undefined
        ? timeoutSignal
        : AbortSignal.any([input.signal, timeoutSignal]);

    let response: Response;
    try {
      const url = new URL(
        "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url",
      );
      url.searchParams.set("agent_id", agentId);
      response = await fetch(url, {
        headers: { "xi-api-key": apiKey },
        method: "GET",
        signal,
      });
    } catch {
      return {
        error: {
          code: timeoutSignal.aborted ? "timeout" : "unavailable",
          message: "ElevenLabs could not create an interview session.",
          provider,
          retryable: true,
        },
        ok: false,
      };
    }

    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "authentication"
          : response.status === 404
            ? "not-found"
            : response.status === 429
              ? "rate-limited"
              : response.status >= 500
                ? "unavailable"
                : "unknown";
      return {
        error: {
          code,
          message: "ElevenLabs could not create an interview session.",
          provider,
          retryable: response.status === 429 || response.status >= 500,
        },
        ok: false,
      };
    }

    let signedUrl: unknown;
    try {
      const responseText = await response.text();
      const payload = JSON.parse(responseText) as unknown;
      signedUrl =
        typeof payload === "object" &&
        payload !== null &&
        "signed_url" in payload
          ? payload.signed_url
          : undefined;
    } catch {
      signedUrl = undefined;
    }

    if (typeof signedUrl === "string") {
      try {
        const parsedUrl = new URL(signedUrl);
        if (
          (parsedUrl.protocol === "wss:" || parsedUrl.protocol === "https:") &&
          (parsedUrl.hostname === "elevenlabs.io" ||
            parsedUrl.hostname.endsWith(".elevenlabs.io"))
        ) {
          return { ok: true, value: parsedUrl.toString() };
        }
      } catch {
        // The common invalid-response result below is intentionally generic.
      }
    }

    return {
      error: {
        code: "invalid-response",
        message: "ElevenLabs returned an invalid interview session.",
        provider,
        retryable: false,
      },
      ok: false,
    };
  }

  fetchFinishedConversation(
    providerCallId: string,
    input: ProviderContextInput,
  ): Promise<ProviderResult<CallStatusSnapshot>> {
    if (this.callProvider === undefined) {
      return Promise.resolve({
        error: {
          code: "misconfigured",
          message: "The call provider is not configured.",
          provider: "call-provider",
          retryable: false,
        },
        ok: false,
      });
    }

    return this.callProvider.getCall(providerCallId, this.createContext(input));
  }
}
