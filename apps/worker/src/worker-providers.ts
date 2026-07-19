import {
  ElevenLabsTwilioCallProvider,
  GooglePlacesBusinessDirectory,
  OpenAiResponsesExtractionProvider,
  SupabaseEvidenceStorage,
  type BusinessDirectoryProvider,
  type CallProvider,
  type EvidenceStorageProvider,
  type StructuredExtractionProvider,
} from "@relay/integrations";

import type { WorkerRuntimeConfig } from "./worker-tokens.js";

export interface WorkerProviderSet {
  readonly businessDirectory?: BusinessDirectoryProvider;
  readonly calls?: CallProvider;
  readonly extraction?: StructuredExtractionProvider;
  readonly storage?: EvidenceStorageProvider;
}

/**
 * Creates only the providers explicitly selected by validated runtime config.
 * Fixture mode deliberately creates no outbound provider clients.
 */
export function createWorkerProviderSet(
  configuration: WorkerRuntimeConfig,
): WorkerProviderSet {
  const businessDirectory =
    configuration.discovery.provider === "google" &&
    configuration.discovery.googlePlacesApiKey !== undefined
      ? new GooglePlacesBusinessDirectory({
          apiKey: configuration.discovery.googlePlacesApiKey,
        })
      : undefined;
  const calls =
    configuration.call.provider === "elevenlabs" &&
    configuration.call.agentId !== undefined &&
    configuration.call.phoneNumberId !== undefined &&
    configuration.call.apiKey !== undefined &&
    configuration.call.webhookSecret !== undefined
      ? new ElevenLabsTwilioCallProvider({
          agentId: configuration.call.agentId,
          agentPhoneNumberId: configuration.call.phoneNumberId,
          apiKey: configuration.call.apiKey,
          webhookSecret: configuration.call.webhookSecret,
          ...(configuration.call.twilioAccountSid === undefined
            ? {}
            : { twilioAccountSid: configuration.call.twilioAccountSid }),
          ...(configuration.call.twilioAuthToken === undefined
            ? {}
            : { twilioAuthToken: configuration.call.twilioAuthToken }),
        })
      : undefined;
  const extraction =
    configuration.ai.provider === "openai" &&
    configuration.ai.apiKey !== undefined
      ? new OpenAiResponsesExtractionProvider({
          apiKey: configuration.ai.apiKey,
          model: configuration.ai.model,
        })
      : undefined;
  const storage =
    configuration.storage.provider === "supabase" &&
    configuration.storage.serviceRoleKey !== undefined &&
    configuration.storage.supabaseUrl !== undefined
      ? new SupabaseEvidenceStorage({
          bucket: configuration.storage.bucket,
          serviceRoleKey: configuration.storage.serviceRoleKey,
          supabaseUrl: configuration.storage.supabaseUrl,
        })
      : undefined;

  return {
    ...(businessDirectory === undefined ? {} : { businessDirectory }),
    ...(calls === undefined ? {} : { calls }),
    ...(extraction === undefined ? {} : { extraction }),
    ...(storage === undefined ? {} : { storage }),
  };
}
