import type {
  Business,
  CallOutcome,
  CallStatus,
  JobSpecification,
  NegotiationStrategy,
} from "@relay/contracts";

import type { ProviderRequestContext, ProviderResult } from "./result.js";

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
}

export interface StartedCall {
  readonly providerCallId: string;
  readonly status: CallStatus;
  readonly submittedAt: string;
}

export interface CallStatusSnapshot {
  readonly outcome?: CallOutcome;
  readonly providerCallId: string;
  readonly status: CallStatus;
  readonly updatedAt: string;
}

export interface VerifiedCallEvent {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly outcome?: CallOutcome;
  readonly providerCallId: string;
  readonly status: CallStatus;
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
