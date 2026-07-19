import type { NegotiationStrategy } from "@relay/contracts";

export const queueNames = {
  businessDiscovery: "business-discovery",
  callExecution: "call-execution",
  negotiationOrchestration: "negotiation-orchestration",
  quoteAnalysis: "quote-analysis",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export interface DiscoverBusinessesPayload {
  readonly jobId: string;
  readonly limit: number;
  readonly runId: string;
  readonly searchRadiusKm: number;
  readonly specificationVersionId: string;
}

export interface PlaceCallPayload {
  readonly businessId: string;
  readonly callId: string;
  readonly runId: string;
  readonly specificationVersionId: string;
  readonly strategy: NegotiationStrategy;
}

export interface ProcessCallOutcomePayload {
  readonly callId: string;
  readonly providerEventId: string;
  readonly runId: string;
}

export interface NormalizeQuotePayload {
  readonly quoteId: string;
  readonly runId: string;
}

export interface RankQuotesPayload {
  readonly runId: string;
}

export interface ContinueNegotiationPayload {
  readonly currentQuoteId?: string;
  readonly negotiationId: string;
  readonly runId: string;
  /** Must refer to a real, evidenced quote; never synthesize leverage. */
  readonly truthfulCompetingQuoteId?: string;
}

export interface QueuePayloadMap {
  readonly "business.discover": DiscoverBusinessesPayload;
  readonly "call.outcome.process": ProcessCallOutcomePayload;
  readonly "call.place": PlaceCallPayload;
  readonly "negotiation.continue": ContinueNegotiationPayload;
  readonly "quote.normalize": NormalizeQuotePayload;
  readonly "quote.rank": RankQuotesPayload;
}

export type QueueJobName = keyof QueuePayloadMap;

export const queueJobNames = {
  continueNegotiation: "negotiation.continue",
  discoverBusinesses: "business.discover",
  normalizeQuote: "quote.normalize",
  placeCall: "call.place",
  processCallOutcome: "call.outcome.process",
  rankQuotes: "quote.rank",
} as const satisfies Readonly<Record<string, QueueJobName>>;

export const queueForJob = {
  "business.discover": queueNames.businessDiscovery,
  "call.outcome.process": queueNames.callExecution,
  "call.place": queueNames.callExecution,
  "negotiation.continue": queueNames.negotiationOrchestration,
  "quote.normalize": queueNames.quoteAnalysis,
  "quote.rank": queueNames.quoteAnalysis,
} as const satisfies Readonly<Record<QueueJobName, QueueName>>;

export interface QueueJobEnvelope<Name extends QueueJobName = QueueJobName> {
  readonly idempotencyKey: string;
  readonly name: Name;
  readonly payload: QueuePayloadMap[Name];
  readonly requestedAt: string;
  readonly traceId: string;
  readonly version: 1;
}

export type AnyQueueJobEnvelope = {
  [Name in QueueJobName]: QueueJobEnvelope<Name>;
}[QueueJobName];

export function getQueueName<Name extends QueueJobName>(name: Name): QueueName {
  return queueForJob[name];
}

export function createQueueJob<Name extends QueueJobName>(
  name: Name,
  payload: QueuePayloadMap[Name],
  metadata: {
    readonly idempotencyKey: string;
    readonly requestedAt: string;
    readonly traceId: string;
  },
): QueueJobEnvelope<Name> {
  return {
    ...metadata,
    name,
    payload,
    version: 1,
  };
}
