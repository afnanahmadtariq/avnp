import type {
  Business,
  CallOutcome,
  CallStatus,
  JobSpecification,
  NegotiationStrategy,
} from "@relay/contracts";

import type { ProviderRequestContext, ProviderResult } from "./result.js";

export interface TruthfulCallLeverage {
  readonly competingBusinessName: string;
  readonly competingQuoteAmountMinor: number;
  readonly competingQuoteId: string;
  readonly currency: string;
  readonly currentQuoteAmountMinor: number;
  readonly currentQuoteId: string;
}

export interface StartCallRequest {
  readonly business: Business;
  readonly callbackUrl: string;
  readonly disclosure: {
    readonly identifyAsAiWhenAsked: true;
    readonly recordingDisclosure: string;
  };
  readonly job: JobSpecification;
  readonly locale: string;
  readonly strategy: NegotiationStrategy;
  /** Evidence-backed leverage revalidated immediately before this call. */
  readonly truthfulLeverage?: TruthfulCallLeverage;
}

export interface StartedCall {
  readonly providerCallId: string;
  readonly status: CallStatus;
  readonly submittedAt: string;
}

export interface CallStatusSnapshot {
  readonly agentId?: string;
  /** Server-issued opaque reference echoed through provider initiation data. */
  readonly clientReference?: string;
  readonly outcome?: CallOutcome;
  readonly providerCallId: string;
  /** Authenticated provider URL; callers must never expose provider credentials. */
  readonly recordingUrl?: string;
  readonly status: CallStatus;
  readonly transcriptText?: string;
  readonly updatedAt: string;
}

export type CallRecordingContentType = "audio/mpeg" | "audio/wav";

export interface CallRecording {
  readonly body: Uint8Array;
  readonly contentLength: number;
  readonly contentType: CallRecordingContentType;
  readonly providerCallId: string;
}

export interface VerifiedCallEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly outcome?: CallOutcome;
  readonly providerCallId: string;
  /** Authenticated provider URL; callers must never expose provider credentials. */
  readonly recordingUrl?: string;
  readonly status: CallStatus;
  readonly transcriptText?: string;
}

export interface CallProvider {
  readonly name: string;

  cancelCall(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<void>>;

  getCall(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<CallStatusSnapshot>>;

  getRecording(
    providerCallId: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<CallRecording>>;

  startCall(
    request: StartCallRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<StartedCall>>;

  verifyWebhook(
    request: {
      readonly body: Uint8Array;
      readonly headers: Readonly<
        Record<string, readonly string[] | string | undefined>
      >;
    },
    context: ProviderRequestContext,
  ): Promise<ProviderResult<VerifiedCallEvent>>;
}
