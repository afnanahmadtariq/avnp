import { createHash } from "node:crypto";

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
  /** Present only when discovery is part of an already-created run. */
  readonly runId?: string;
  readonly searchRadiusKm: number;
  readonly specificationVersionId: string;
}

export interface CancelCallPayload {
  readonly callId: string;
  readonly runId: string;
}

export interface PlaceCallPayload {
  readonly businessId: string;
  readonly callId: string;
  /** Present together only for an evidence-backed follow-up call. */
  readonly currentQuoteId?: string;
  readonly runId: string;
  readonly specificationVersionId: string;
  readonly strategy: NegotiationStrategy;
  /** Present together only for an evidence-backed follow-up call. */
  readonly truthfulCompetingQuoteId?: string;
}

export interface ProcessCallOutcomePayload {
  readonly callId: string;
  readonly providerEventId: string;
  readonly runId: string;
}

export interface NormalizeQuotePayload {
  /** The evidenced call whose transcript is the extraction source. */
  readonly callId: string;
  readonly quoteId: string;
  readonly runId: string;
}

export interface RankQuotesPayload {
  readonly runId: string;
}

export interface ContinueNegotiationPayload {
  readonly currentQuoteId: string;
  readonly negotiationId: string;
  readonly runId: string;
  /** Must refer to a real, evidenced quote; never synthesize leverage. */
  readonly truthfulCompetingQuoteId: string;
}

export interface QueuePayloadMap {
  readonly "business.discover": DiscoverBusinessesPayload;
  readonly "call.cancel": CancelCallPayload;
  readonly "call.outcome.process": ProcessCallOutcomePayload;
  readonly "call.place": PlaceCallPayload;
  readonly "negotiation.continue": ContinueNegotiationPayload;
  readonly "quote.normalize": NormalizeQuotePayload;
  readonly "quote.rank": RankQuotesPayload;
}

export type QueueJobName = keyof QueuePayloadMap;

export const queueJobNames = {
  cancelCall: "call.cancel",
  continueNegotiation: "negotiation.continue",
  discoverBusinesses: "business.discover",
  normalizeQuote: "quote.normalize",
  placeCall: "call.place",
  processCallOutcome: "call.outcome.process",
  rankQuotes: "quote.rank",
} as const satisfies Readonly<Record<string, QueueJobName>>;

export const queueForJob = {
  "business.discover": queueNames.businessDiscovery,
  "call.cancel": queueNames.callExecution,
  "call.outcome.process": queueNames.callExecution,
  "call.place": queueNames.callExecution,
  "negotiation.continue": queueNames.negotiationOrchestration,
  "quote.normalize": queueNames.quoteAnalysis,
  "quote.rank": queueNames.quoteAnalysis,
} as const satisfies Readonly<Record<QueueJobName, QueueName>>;

export const QUEUE_JOB_ENVELOPE_VERSION = 1 as const;

export interface QueueJobEnvelope<Name extends QueueJobName = QueueJobName> {
  readonly idempotencyKey: string;
  readonly name: Name;
  readonly payload: QueuePayloadMap[Name];
  readonly requestedAt: string;
  readonly traceId: string;
  readonly version: typeof QUEUE_JOB_ENVELOPE_VERSION;
}

export type AnyQueueJobEnvelope = {
  [Name in QueueJobName]: QueueJobEnvelope<Name>;
}[QueueJobName];

export class InvalidQueueJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueueJobError";
  }
}

export class NonRetryableQueueError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NonRetryableQueueError";
  }
}

export function getQueueName<Name extends QueueJobName>(name: Name): QueueName {
  return queueForJob[name];
}

export function createQueueJob<Name extends QueueJobName>(
  name: Name,
  payload: QueuePayloadMap[Name],
  metadata: {
    readonly idempotencyKey: string;
    readonly requestedAt?: string;
    readonly traceId: string;
  },
): QueueJobEnvelope<Name> {
  const job: QueueJobEnvelope<Name> = {
    idempotencyKey: metadata.idempotencyKey,
    name,
    payload,
    requestedAt: metadata.requestedAt ?? new Date().toISOString(),
    traceId: metadata.traceId,
    version: QUEUE_JOB_ENVELOPE_VERSION,
  };

  assertQueueJobEnvelope(job);
  return job;
}

/**
 * Creates a BullMQ-safe, deterministic identifier. BullMQ job IDs cannot use
 * colons, and hashing keeps caller-provided keys out of Redis key names/logs.
 */
export function createQueueJobId(
  envelope: Pick<QueueJobEnvelope, "idempotencyKey" | "name">,
): string {
  const digest = createHash("sha256")
    .update(`${envelope.name}\u0000${envelope.idempotencyKey}`)
    .digest("hex");

  return `${envelope.name.replaceAll(".", "-")}-${digest.slice(0, 48)}`;
}

export function parseQueueJobEnvelope(value: unknown): AnyQueueJobEnvelope {
  if (!isRecord(value)) {
    throw invalidEnvelope();
  }

  const name = value.name;

  if (!isQueueJobName(name)) {
    throw invalidEnvelope();
  }

  if (
    value.version !== QUEUE_JOB_ENVELOPE_VERSION ||
    !isBoundedString(value.idempotencyKey, 1, 500) ||
    !isBoundedString(value.traceId, 1, 200) ||
    !isIsoDateTime(value.requestedAt) ||
    !isPayload(name, value.payload)
  ) {
    throw invalidEnvelope();
  }

  return value as unknown as AnyQueueJobEnvelope;
}

export function assertQueueJobEnvelope(
  value: unknown,
): asserts value is AnyQueueJobEnvelope {
  parseQueueJobEnvelope(value);
}

function invalidEnvelope(): InvalidQueueJobError {
  return new InvalidQueueJobError(
    "Queue job envelope is invalid or uses an unsupported version",
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueueJobName(value: unknown): value is QueueJobName {
  return typeof value === "string" && Object.hasOwn(queueForJob, value);
}

function isBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimumLength &&
    value.length <= maximumLength
  );
}

function isIsoDateTime(value: unknown): value is string {
  return (
    isBoundedString(value, 1, 100) &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function hasExactlyKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);

  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function hasIdentifiers(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return keys.every((key) => isBoundedString(value[key], 1, 200));
}

function isPayload(name: QueueJobName, value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  switch (name) {
    case "business.discover":
      return (
        hasExactlyKeys(
          value,
          ["jobId", "limit", "searchRadiusKm", "specificationVersionId"],
          ["runId"],
        ) &&
        hasIdentifiers(value, ["jobId", "specificationVersionId"]) &&
        isOptionalIdentifier(value.runId) &&
        typeof value.limit === "number" &&
        Number.isInteger(value.limit) &&
        value.limit >= 1 &&
        value.limit <= 100 &&
        typeof value.searchRadiusKm === "number" &&
        Number.isFinite(value.searchRadiusKm) &&
        value.searchRadiusKm > 0 &&
        value.searchRadiusKm <= 500
      );
    case "call.cancel":
      return (
        hasExactlyKeys(value, ["callId", "runId"]) &&
        hasIdentifiers(value, ["callId", "runId"])
      );
    case "call.outcome.process":
      return (
        hasExactlyKeys(value, ["callId", "providerEventId", "runId"]) &&
        hasIdentifiers(value, ["callId", "providerEventId", "runId"])
      );
    case "call.place":
      return (
        hasExactlyKeys(
          value,
          [
            "businessId",
            "callId",
            "runId",
            "specificationVersionId",
            "strategy",
          ],
          ["currentQuoteId", "truthfulCompetingQuoteId"],
        ) &&
        hasIdentifiers(value, [
          "businessId",
          "callId",
          "runId",
          "specificationVersionId",
        ]) &&
        hasOptionalIdentifierPair(
          value.currentQuoteId,
          value.truthfulCompetingQuoteId,
        ) &&
        isNegotiationStrategy(value.strategy)
      );
    case "negotiation.continue":
      return (
        hasExactlyKeys(value, [
          "currentQuoteId",
          "negotiationId",
          "runId",
          "truthfulCompetingQuoteId",
        ]) &&
        hasIdentifiers(value, [
          "currentQuoteId",
          "negotiationId",
          "runId",
          "truthfulCompetingQuoteId",
        ])
      );
    case "quote.normalize":
      return (
        hasExactlyKeys(value, ["callId", "quoteId", "runId"]) &&
        hasIdentifiers(value, ["callId", "quoteId", "runId"])
      );
    case "quote.rank":
      return (
        hasExactlyKeys(value, ["runId"]) && hasIdentifiers(value, ["runId"])
      );
  }
}

function isOptionalIdentifier(value: unknown): boolean {
  return value === undefined || isBoundedString(value, 1, 200);
}

function hasOptionalIdentifierPair(left: unknown, right: unknown): boolean {
  return (
    (left === undefined && right === undefined) ||
    (isBoundedString(left, 1, 200) && isBoundedString(right, 1, 200))
  );
}

function isNegotiationStrategy(value: unknown): value is NegotiationStrategy {
  return (
    value === "price_match" ||
    value === "fee_removal" ||
    value === "discount_request" ||
    value === "bundle_offer" ||
    value === "promotion_request"
  );
}
