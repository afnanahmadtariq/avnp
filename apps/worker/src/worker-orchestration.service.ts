import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  businessSchema,
  jobSpecificationSchema,
  quoteSchema,
  type Business,
  type CallOutcomeType,
  type CallStatus,
  type JobSpecification,
  type NegotiationStrategy,
  type Quote,
} from "@relay/contracts";
import {
  AuditActor,
  CallStatus as DatabaseCallStatus,
  CandidateStatus,
  EvidenceKind,
  JobStatus,
  NegotiationRunStatus,
  NegotiationStatus,
  PricingModel,
  Prisma,
  QuoteEstimateType,
  QuoteStatus,
  type DatabaseClient,
  type NegotiationStrategy as DatabaseNegotiationStrategy,
} from "@relay/database";
import { rankQuotes } from "@relay/domain";
import {
  pendingCallRegistrationMarker,
  type CallProvider,
  type ProviderFailure,
  type ProviderRequestContext,
  type ProviderResult,
  type StoreEvidenceRequest,
  type StoredEvidence,
  type TruthfulCallLeverage,
} from "@relay/integrations";
import {
  createQueueJob,
  NonRetryableQueueError,
  queueJobNames,
  type QueueJobEnvelope,
  type QueueProcessingContext,
} from "@relay/queue";

import type { WorkerJobHandlers } from "./job-handlers.js";
import { WorkerDatabaseService } from "./worker-database.service.js";
import type { WorkerProviderSet } from "./worker-providers.js";
import { WorkerQueueProducerService } from "./worker-queue-producer.service.js";
import {
  WORKER_PROVIDER_SET,
  WORKER_RUNTIME_CONFIG,
  type WorkerRuntimeConfig,
} from "./worker-tokens.js";

const MILLISECONDS_PER_DAY = 86_400_000;
const DEFAULT_EVIDENCE_RETENTION_DAYS = 30;
const LEGACY_REPRESENTED_AS = "the customer";
const MAX_REPRESENTED_AS_LENGTH = 120;
const MAX_FOLLOW_UP_ROUNDS = 1;
const TERMINAL_CALL_STATUSES = new Set<DatabaseCallStatus>([
  DatabaseCallStatus.CANCELLED,
  DatabaseCallStatus.COMPLETED,
  DatabaseCallStatus.FAILED,
]);
const TERMINAL_RUN_STATUSES = new Set<NegotiationRunStatus>([
  NegotiationRunStatus.CANCELLED,
  NegotiationRunStatus.COMPLETED,
  NegotiationRunStatus.FAILED,
  NegotiationRunStatus.PARTIALLY_COMPLETED,
]);
const CALL_STARTABLE_RUN_STATUSES = [
  NegotiationRunStatus.QUEUED,
  NegotiationRunStatus.CALLING,
] as const;

const rankingRunInclude = {
  calls: true,
  job: true,
  negotiations: true,
  quotes: {
    include: { business: true, evidence: true, items: true },
    orderBy: { createdAt: "asc" },
  },
  recommendation: true,
  specificationVersion: true,
} satisfies Prisma.NegotiationRunInclude;

const truthfulLeverageQuoteInclude = {
  business: { select: { name: true } },
  evidence: { select: { kind: true } },
  negotiation: {
    select: { businessId: true, runId: true, status: true },
  },
} satisfies Prisma.QuoteInclude;

type RankingRun = Prisma.NegotiationRunGetPayload<{
  include: typeof rankingRunInclude;
}>;
type RankingQuote = RankingRun["quotes"][number];
type TruthfulLeverageQuote = Prisma.QuoteGetPayload<{
  include: typeof truthfulLeverageQuoteInclude;
}>;

interface EvidenceBackedContinuation {
  readonly currentQuoteId: string;
  readonly negotiationId: string;
  readonly truthfulCompetingQuoteId: string;
}

interface ContinuationNegotiationInput {
  readonly businessId: string;
  readonly currentRound: number;
  readonly id: string;
  readonly status: NegotiationStatus;
}

interface ContinuationQuoteInput {
  readonly businessId: string;
  readonly createdAt: Date;
  readonly currency: string;
  readonly evidence: readonly { readonly kind: EvidenceKind }[];
  readonly id: string;
  readonly negotiationId: string | null;
  readonly status: QuoteStatus;
  readonly totalAmountCents: number | null;
}

interface TruthfulLeverageQuoteInput extends ContinuationQuoteInput {
  readonly businessName: string;
  readonly negotiationBusinessId: string | null;
  readonly negotiationRunId: string | null;
  readonly negotiationStatus: NegotiationStatus | null;
  readonly runId: string | null;
}

interface RankingQuoteVersionInput {
  readonly businessId: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly status: QuoteStatus;
}

class ProviderOperationError extends Error {
  constructor(readonly failure: ProviderFailure) {
    super(`${failure.provider} ${failure.code}: ${failure.message}`);
    this.name = "ProviderOperationError";
  }
}

class CallStillInProgressError extends Error {
  constructor(status: DatabaseCallStatus) {
    super(`The provider call is still ${status.toLowerCase()}.`);
    this.name = "CallStillInProgressError";
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function representedAsFromSourceMetadata(
  sourceMetadata: unknown,
): string {
  const metadata = asRecord(sourceMetadata);
  if (!Object.hasOwn(metadata, "representedAs")) {
    return LEGACY_REPRESENTED_AS;
  }

  const value = metadata.representedAs;
  if (typeof value !== "string") {
    throw new NonRetryableQueueError(
      "The confirmed calling identity snapshot is invalid.",
    );
  }

  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0 ||
    normalized.length > MAX_REPRESENTED_AS_LENGTH ||
    containsControlCharacter(normalized)
  ) {
    throw new NonRetryableQueueError(
      "The confirmed calling identity snapshot is invalid.",
    );
  }

  return normalized;
}

function extractionIsSettled(value: unknown): boolean {
  const extraction = asRecord(value).extraction;
  return ["completed", "failed", "skipped"].includes(String(extraction));
}

export function classifyNonQuoteOutcome(
  explicitOutcome: CallOutcomeType | undefined,
  transcript: string | null,
): Exclude<CallOutcomeType, "quote_received"> | undefined {
  if (explicitOutcome === "quote_received") return undefined;

  const containsQuotedAmount =
    transcript !== null &&
    /[$€£]\s?\d|\b\d[\d,]*(?:\.\d{1,2})?\s*(?:dollars|usd)\b|\b(?:total|price|quote|estimate)\b.{0,40}\d/i.test(
      transcript,
    );
  if (containsQuotedAmount) return undefined;
  if (explicitOutcome !== undefined) {
    return explicitOutcome;
  }
  if (!transcript?.trim()) return "no_answer";

  const normalized = transcript.toLowerCase();
  if (/\b(?:busy signal|line (?:is|was) busy)\b/.test(normalized)) {
    return "busy";
  }
  if (/\b(?:no answer|voicemail|voice mail)\b/.test(normalized)) {
    return "no_answer";
  }
  if (
    /\b(?:call|contact|reach)(?: me| us)? back\b|\bcallback\b|\btry again later\b/.test(
      normalized,
    )
  ) {
    return "callback_requested";
  }
  if (
    /\b(?:not interested|declin(?:e|ed)|unable to (?:quote|help|take)|can(?:not|'t) (?:quote|help|take))\b/.test(
      normalized,
    )
  ) {
    return "declined";
  }
  return "unavailable";
}

export function selectLatestActiveQuoteIds(
  quotes: readonly RankingQuoteVersionInput[],
): ReadonlySet<string> {
  const latestByBusiness = new Map<string, RankingQuoteVersionInput>();
  for (const quote of quotes) {
    const current = latestByBusiness.get(quote.businessId);
    if (
      current === undefined ||
      current.createdAt.getTime() < quote.createdAt.getTime() ||
      (current.createdAt.getTime() === quote.createdAt.getTime() &&
        current.id.localeCompare(quote.id) < 0)
    ) {
      latestByBusiness.set(quote.businessId, quote);
    }
  }
  return new Set(
    [...latestByBusiness.values()]
      .filter((quote) => quote.status !== QuoteStatus.WITHDRAWN)
      .map((quote) => quote.id),
  );
}

export function validateTruthfulLeverageQuotes(input: {
  readonly competingQuote: TruthfulLeverageQuoteInput | null;
  readonly currentQuote: TruthfulLeverageQuoteInput | null;
  readonly expectedBusinessId: string;
  readonly expectedCurrency: string;
  readonly expectedNegotiationId: string;
  readonly expectedRunId: string;
  readonly latestCompetingQuoteId: string | undefined;
  readonly latestCurrentQuoteId: string | undefined;
}): TruthfulCallLeverage {
  const current = input.currentQuote;
  const competing = input.competingQuote;
  const activeNegotiationStatuses = new Set<NegotiationStatus>([
    NegotiationStatus.IMPROVED,
    NegotiationStatus.IN_PROGRESS,
    NegotiationStatus.UNCHANGED,
  ]);
  const isTranscriptBacked = (quote: TruthfulLeverageQuoteInput): boolean =>
    quote.evidence.some(
      (evidence) => evidence.kind === EvidenceKind.TRANSCRIPT,
    );
  const hasActiveNegotiation = (quote: TruthfulLeverageQuoteInput): boolean =>
    quote.negotiationId !== null &&
    quote.negotiationBusinessId === quote.businessId &&
    quote.negotiationRunId === quote.runId &&
    quote.negotiationStatus !== null &&
    activeNegotiationStatuses.has(quote.negotiationStatus);

  if (
    current === null ||
    competing === null ||
    current.id !== input.latestCurrentQuoteId ||
    competing.id !== input.latestCompetingQuoteId ||
    current.runId !== input.expectedRunId ||
    competing.runId !== input.expectedRunId ||
    current.negotiationId !== input.expectedNegotiationId ||
    current.businessId !== input.expectedBusinessId ||
    competing.businessId === input.expectedBusinessId ||
    current.status === QuoteStatus.WITHDRAWN ||
    competing.status === QuoteStatus.WITHDRAWN ||
    !hasActiveNegotiation(current) ||
    !hasActiveNegotiation(competing) ||
    !isTranscriptBacked(current) ||
    !isTranscriptBacked(competing) ||
    current.currency !== input.expectedCurrency ||
    competing.currency !== input.expectedCurrency ||
    current.currency !== competing.currency ||
    current.totalAmountCents === null ||
    competing.totalAmountCents === null ||
    !Number.isSafeInteger(current.totalAmountCents) ||
    !Number.isSafeInteger(competing.totalAmountCents) ||
    current.totalAmountCents <= 0 ||
    competing.totalAmountCents <= 0 ||
    competing.totalAmountCents >= current.totalAmountCents ||
    competing.businessName.trim().length === 0
  ) {
    throw new NonRetryableQueueError(
      "Truthful leverage requires the latest active, transcript-evidenced, same-currency quotes from this run, with a lower competing offer from another business.",
    );
  }

  return {
    competingBusinessName: competing.businessName,
    competingQuoteAmountMinor: competing.totalAmountCents,
    competingQuoteId: competing.id,
    currency: current.currency,
    currentQuoteAmountMinor: current.totalAmountCents,
    currentQuoteId: current.id,
  };
}

export function selectEvidenceBackedContinuations(input: {
  readonly eligibleQuoteIds: ReadonlySet<string>;
  readonly expectedCurrency: string;
  readonly negotiations: readonly ContinuationNegotiationInput[];
  readonly quotes: readonly ContinuationQuoteInput[];
}): readonly EvidenceBackedContinuation[] {
  const latestQuoteByNegotiation = new Map<string, ContinuationQuoteInput>();
  for (const quote of input.quotes) {
    if (quote.negotiationId === null) continue;
    const current = latestQuoteByNegotiation.get(quote.negotiationId);
    if (
      current === undefined ||
      current.createdAt.getTime() < quote.createdAt.getTime() ||
      (current.createdAt.getTime() === quote.createdAt.getTime() &&
        current.id.localeCompare(quote.id) < 0)
    ) {
      latestQuoteByNegotiation.set(quote.negotiationId, quote);
    }
  }

  const activeNegotiationById = new Map(
    input.negotiations
      .filter(
        (negotiation) =>
          negotiation.status === NegotiationStatus.IMPROVED ||
          negotiation.status === NegotiationStatus.UNCHANGED,
      )
      .map((negotiation) => [negotiation.id, negotiation] as const),
  );
  const isEligibleQuote = (quote: ContinuationQuoteInput): boolean => {
    const negotiation =
      quote.negotiationId === null
        ? undefined
        : activeNegotiationById.get(quote.negotiationId);
    return (
      negotiation !== undefined &&
      negotiation.businessId === quote.businessId &&
      quote.status !== QuoteStatus.WITHDRAWN &&
      quote.currency === input.expectedCurrency &&
      quote.totalAmountCents !== null &&
      quote.totalAmountCents > 0 &&
      quote.evidence.some(
        (evidence) => evidence.kind === EvidenceKind.TRANSCRIPT,
      ) &&
      input.eligibleQuoteIds.has(quote.id)
    );
  };
  const latestEligibleQuotes = [...latestQuoteByNegotiation.values()].filter(
    isEligibleQuote,
  );

  return input.negotiations.flatMap((negotiation) => {
    if (
      negotiation.currentRound >= MAX_FOLLOW_UP_ROUNDS ||
      (negotiation.status !== NegotiationStatus.IMPROVED &&
        negotiation.status !== NegotiationStatus.UNCHANGED)
    ) {
      return [];
    }
    const currentQuote = latestQuoteByNegotiation.get(negotiation.id);
    if (
      currentQuote === undefined ||
      !isEligibleQuote(currentQuote) ||
      currentQuote.totalAmountCents === null
    ) {
      return [];
    }
    const competingQuote = latestEligibleQuotes
      .filter(
        (quote) =>
          quote.businessId !== negotiation.businessId &&
          quote.totalAmountCents !== null &&
          quote.totalAmountCents < currentQuote.totalAmountCents!,
      )
      .sort((left, right) => {
        const amountDifference =
          left.totalAmountCents! - right.totalAmountCents!;
        return amountDifference === 0
          ? left.id.localeCompare(right.id)
          : amountDifference;
      })[0];
    return competingQuote === undefined
      ? []
      : [
          {
            currentQuoteId: currentQuote.id,
            negotiationId: negotiation.id,
            truthfulCompetingQuoteId: competingQuote.id,
          },
        ];
  });
}

function deterministicId(prefix: string, ...values: readonly string[]): string {
  const digest = createHash("sha256")
    .update(values.join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  return `${prefix}_${digest}`;
}

function databaseCallStatus(status: CallStatus): DatabaseCallStatus {
  switch (status) {
    case "queued":
      return DatabaseCallStatus.QUEUED;
    case "dialing":
      return DatabaseCallStatus.DIALING;
    case "in_progress":
      return DatabaseCallStatus.IN_PROGRESS;
    case "negotiating":
      return DatabaseCallStatus.NEGOTIATING;
    case "completed":
      return DatabaseCallStatus.COMPLETED;
    case "failed":
      return DatabaseCallStatus.FAILED;
    case "cancelled":
      return DatabaseCallStatus.CANCELLED;
  }
}

function statusProgress(status: DatabaseCallStatus): number {
  switch (status) {
    case DatabaseCallStatus.QUEUED:
      return 0;
    case DatabaseCallStatus.DIALING:
      return 1;
    case DatabaseCallStatus.IN_PROGRESS:
      return 2;
    case DatabaseCallStatus.NEGOTIATING:
      return 3;
    case DatabaseCallStatus.CANCELLED:
    case DatabaseCallStatus.COMPLETED:
    case DatabaseCallStatus.FAILED:
      return 4;
  }
}

function monotonicCallStatus(
  current: DatabaseCallStatus,
  incoming: DatabaseCallStatus,
): DatabaseCallStatus {
  if (TERMINAL_CALL_STATUSES.has(current)) return current;
  return statusProgress(incoming) > statusProgress(current)
    ? incoming
    : current;
}

function databasePricingModel(value: Quote["pricingModel"]): PricingModel {
  switch (value) {
    case "fixed":
      return PricingModel.FIXED;
    case "hourly":
      return PricingModel.HOURLY;
    case "range":
      return PricingModel.RANGE;
  }
}

function databaseEstimateType(
  value: Quote["estimateType"],
): QuoteEstimateType | undefined {
  switch (value) {
    case "binding":
      return QuoteEstimateType.BINDING;
    case "non_binding":
      return QuoteEstimateType.NON_BINDING;
    case undefined:
      return undefined;
  }
}

function databaseQuoteStatus(value: Quote["status"]): QuoteStatus {
  switch (value) {
    case "initial":
      return QuoteStatus.INITIAL;
    case "negotiated":
      return QuoteStatus.NEGOTIATED;
    case "final":
      return QuoteStatus.FINAL;
    case "withdrawn":
      return QuoteStatus.WITHDRAWN;
  }
}

function contractStrategy(
  value: DatabaseNegotiationStrategy,
): NegotiationStrategy {
  return value.toLowerCase() as NegotiationStrategy;
}

function businessContract(business: {
  readonly address: Prisma.JsonValue | null;
  readonly externalId: string | null;
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly provider: string;
  readonly rating: Prisma.Decimal | null;
  readonly reviewCount: number | null;
  readonly verification: Prisma.JsonValue | null;
  readonly websiteUrl: string | null;
}): Business {
  const verification = asRecord(business.verification);
  return businessSchema.parse({
    id: business.id,
    name: business.name,
    phone: business.phone,
    location: business.address,
    source: business.provider === "fixture" ? "fixture" : "directory",
    ...(business.externalId === null
      ? {}
      : { externalId: business.externalId }),
    ...(business.rating === null ? {} : { rating: Number(business.rating) }),
    ...(business.reviewCount === null
      ? {}
      : { reviewCount: business.reviewCount }),
    ...(business.websiteUrl === null
      ? {}
      : { websiteUrl: business.websiteUrl }),
    ...(typeof verification.distanceMeters === "number"
      ? { distanceMeters: Math.max(0, Math.trunc(verification.distanceMeters)) }
      : {}),
    ...(Array.isArray(verification.categories)
      ? { categories: verification.categories }
      : {}),
  });
}

function evidenceRetentionDays(settings: Prisma.JsonValue | null): number {
  const value = asRecord(settings).evidenceRetentionDays;
  return value === 7 || value === 30 || value === 90
    ? value
    : DEFAULT_EVIDENCE_RETENTION_DAYS;
}

function mergeJson(
  current: Prisma.JsonValue | null,
  additions: Readonly<Record<string, unknown>>,
): Prisma.InputJsonValue {
  return toJson({ ...asRecord(current), ...additions });
}

@Injectable()
export class WorkerOrchestrationService {
  constructor(
    @Inject(WorkerDatabaseService)
    private readonly database: WorkerDatabaseService,
    @Inject(WORKER_PROVIDER_SET)
    private readonly providers: WorkerProviderSet,
    @Inject(WorkerQueueProducerService)
    private readonly queue: WorkerQueueProducerService,
    @Inject(WORKER_RUNTIME_CONFIG)
    private readonly configuration: WorkerRuntimeConfig,
  ) {}

  createHandlers(): WorkerJobHandlers {
    return {
      [queueJobNames.cancelCall]: (envelope, context) =>
        this.cancelCall(envelope, context),
      [queueJobNames.continueNegotiation]: (envelope, context) =>
        this.continueNegotiation(envelope, context),
      [queueJobNames.discoverBusinesses]: (envelope, context) =>
        this.discoverBusinesses(envelope, context),
      [queueJobNames.normalizeQuote]: (envelope, context) =>
        this.normalizeQuote(envelope, context),
      [queueJobNames.placeCall]: (envelope, context) =>
        this.placeCall(envelope, context),
      [queueJobNames.processCallOutcome]: (envelope, context) =>
        this.processCallOutcome(envelope, context),
      [queueJobNames.rankQuotes]: (envelope, context) =>
        this.rankRunQuotes(envelope, context),
    };
  }

  async discoverBusinesses(
    envelope: QueueJobEnvelope<"business.discover">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const provider = this.requireProvider(
      this.providers.businessDirectory,
      "business discovery",
    );
    const client = this.database.client;
    const version = await client.jobSpecificationVersion.findUnique({
      include: { job: true },
      where: { id: envelope.payload.specificationVersionId },
    });
    if (version === null || version.jobId !== envelope.payload.jobId) {
      throw new NonRetryableQueueError(
        "The confirmed specification does not belong to the discovery job.",
      );
    }
    const specification = this.parseSpecification(version.specification);
    const runId = envelope.payload.runId;
    if (runId !== undefined) {
      const run = await client.negotiationRun.findUnique({
        where: { id: runId },
      });
      if (
        run === null ||
        run.jobId !== version.jobId ||
        run.specificationVersionId !== version.id
      ) {
        throw new NonRetryableQueueError(
          "The discovery run does not use the supplied confirmed specification.",
        );
      }
      if (TERMINAL_RUN_STATUSES.has(run.status)) return;
      await client.negotiationRun.update({
        data: {
          startedAt: run.startedAt ?? new Date(),
          status: NegotiationRunStatus.DISCOVERING,
        },
        where: { id: run.id },
      });
    }
    await client.job.update({
      data: { status: JobStatus.DISCOVERING },
      where: { id: version.jobId },
    });

    const result = await provider.search(
      {
        job: specification,
        limit: envelope.payload.limit,
        searchRadiusKm: envelope.payload.searchRadiusKm,
      },
      this.providerContext(envelope, context),
    );
    const candidates = result.ok
      ? result.value
      : await this.handleWorkflowProviderFailure({
          context,
          failure: result.error,
          jobId: version.jobId,
          operation: "business discovery",
          ...(runId === undefined ? {} : { runId }),
        });

    for (const [index, candidate] of candidates.entries()) {
      const externalId = candidate.externalId ?? candidate.id;
      const business = await client.business.upsert({
        create: {
          address: toJson(candidate.location),
          externalId,
          name: candidate.name,
          phone: candidate.phone,
          provider: provider.name,
          rating: candidate.rating ?? null,
          reviewCount: candidate.reviewCount ?? null,
          verification: toJson({
            categories: candidate.categories ?? [],
            distanceMeters: candidate.distanceMeters,
            discoveredBy: provider.name,
          }),
          websiteUrl: candidate.websiteUrl ?? null,
        },
        update: {
          address: toJson(candidate.location),
          name: candidate.name,
          phone: candidate.phone,
          rating: candidate.rating ?? null,
          reviewCount: candidate.reviewCount ?? null,
          verification: toJson({
            categories: candidate.categories ?? [],
            distanceMeters: candidate.distanceMeters,
            discoveredBy: provider.name,
          }),
          websiteUrl: candidate.websiteUrl ?? null,
        },
        where: {
          provider_externalId: { externalId, provider: provider.name },
        },
      });
      await client.jobBusiness.upsert({
        create: {
          businessId: business.id,
          discoveryRank: index + 1,
          jobId: version.jobId,
          status: CandidateStatus.DISCOVERED,
        },
        update: { discoveryRank: index + 1 },
        where: {
          jobId_businessId: { businessId: business.id, jobId: version.jobId },
        },
      });

      if (runId !== undefined) {
        await this.appendRunEvent(
          runId,
          "business.discovered",
          AuditActor.WORKER,
          { businessId: business.id, provider: provider.name, rank: index + 1 },
          `${envelope.idempotencyKey}:business:${business.id}`,
        );
      }
    }

    await client.auditEvent.create({
      data: {
        actor: AuditActor.WORKER,
        eventType: "business.discovery.completed",
        jobId: version.jobId,
        occurredAt: new Date(),
        payload: toJson({
          count: candidates.length,
          provider: provider.name,
        }),
        traceId: envelope.traceId,
      },
    });
    await client.job.update({
      data: { status: JobStatus.READY },
      where: { id: version.jobId },
    });
    if (runId !== undefined) {
      if (candidates.length === 0) {
        await client.negotiationRun.update({
          data: {
            completedAt: new Date(),
            failureCode: "no_businesses_found",
            failureMessage:
              "No callable businesses matched the confirmed brief.",
            status: NegotiationRunStatus.FAILED,
          },
          where: { id: runId },
        });
      } else {
        await client.negotiationRun.updateMany({
          data: { status: NegotiationRunStatus.QUEUED },
          where: { id: runId, status: NegotiationRunStatus.DISCOVERING },
        });
      }
    }
    await context.updateProgress(100);
  }

  async placeCall(
    envelope: QueueJobEnvelope<"call.place">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const provider = this.requireProvider(
      this.providers.calls,
      "call placement",
    );
    const client = this.database.client;
    const call = await client.call.findUnique({
      include: {
        business: true,
        job: true,
        negotiation: true,
        run: { include: { specificationVersion: true } },
      },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.run === null ||
      call.runId !== envelope.payload.runId ||
      call.businessId !== envelope.payload.businessId ||
      call.run.specificationVersionId !==
        envelope.payload.specificationVersionId
    ) {
      throw new NonRetryableQueueError(
        "The call job does not match its run, business, and confirmed specification.",
      );
    }
    const run = call.run;
    if (run.status === NegotiationRunStatus.PAUSED) {
      if (
        call.providerCallId !== null &&
        call.status !== DatabaseCallStatus.COMPLETED &&
        call.status !== DatabaseCallStatus.FAILED
      ) {
        await this.pauseRegisteredProviderCall(
          {
            id: call.id,
            providerCallId: call.providerCallId,
            structuredOutcome: call.structuredOutcome,
          },
          envelope.payload,
          run.id,
          provider,
          envelope,
          context,
        );
      } else if (
        call.providerCallId === null &&
        call.status === DatabaseCallStatus.DIALING
      ) {
        const restored = await this.restorePausedCallClaim(call.id);
        if (!restored) {
          const failure = {
            code: "unavailable",
            message:
              "The provider may have accepted the previous call start, so Relay will not place a duplicate.",
            provider: provider.name,
            retryable: false,
          } as const satisfies ProviderFailure;
          if (await this.failCallStart(call.id, run.id, failure, envelope)) {
            await this.enqueueRank(
              run.id,
              `call-start-uncertain:${call.id}`,
              envelope.traceId,
            );
          }
        }
      }
      return;
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      if (
        call.providerCallId === null ||
        call.status === DatabaseCallStatus.COMPLETED ||
        call.status === DatabaseCallStatus.FAILED
      ) {
        return;
      }
      if (call.status !== DatabaseCallStatus.CANCELLED) {
        await client.call.updateMany({
          data: {
            endedAt: call.endedAt ?? new Date(),
            status: DatabaseCallStatus.CANCELLED,
          },
          where: {
            id: call.id,
            providerCallId: call.providerCallId,
            status: { notIn: [...TERMINAL_CALL_STATUSES] },
          },
        });
      }
      await this.cancelRegisteredProviderCall(
        {
          id: call.id,
          providerCallId: call.providerCallId,
          structuredOutcome: call.structuredOutcome,
        },
        run.id,
        provider,
        envelope,
        context,
      );
      return;
    }
    if (
      run.callingConsentAt === null ||
      run.aiDisclosureAcknowledgedAt === null ||
      run.recordingConsentAt === null
    ) {
      throw new NonRetryableQueueError(
        "Calling, recording, and AI disclosure consent are required before a provider call.",
      );
    }
    if (call.providerCallId !== null) {
      await this.reconcilePendingCallWebhooks(
        {
          id: call.id,
          jobId: call.jobId,
          providerCallId: call.providerCallId,
          runId: run.id,
        },
        provider.name,
        envelope.traceId,
      );
      if (!TERMINAL_CALL_STATUSES.has(call.status)) {
        await this.enqueueOutcomePoll(
          call.id,
          run.id,
          call.providerCallId,
          envelope.traceId,
        );
      }
      return;
    }
    if (call.status !== DatabaseCallStatus.QUEUED) {
      if (
        call.status === DatabaseCallStatus.DIALING &&
        call.providerCallId === null
      ) {
        const failure = {
          code: "unavailable",
          message:
            "The provider may have accepted the previous call start, so Relay will not place a duplicate.",
          provider: provider.name,
          retryable: false,
        } as const satisfies ProviderFailure;
        const failed = await this.failCallStart(
          call.id,
          run.id,
          failure,
          envelope,
        );
        if (!failed) {
          await this.restorePausedCallClaim(call.id);
          return;
        }
        await this.enqueueRank(
          run.id,
          `call-start-uncertain:${call.id}`,
          envelope.traceId,
        );
      }
      throw new NonRetryableQueueError(
        "An unregistered provider call cannot be started more than once.",
      );
    }

    const representedAs = representedAsFromSourceMetadata(
      run.specificationVersion.sourceMetadata,
    );

    const truthfulLeverage = await this.loadTruthfulLeverage({
      businessId: call.businessId,
      currentQuoteId: envelope.payload.currentQuoteId,
      expectedCurrency: call.job.currency,
      negotiationId: call.negotiationId,
      runId: run.id,
      truthfulCompetingQuoteId: envelope.payload.truthfulCompetingQuoteId,
    });

    const claimed = await client.call.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        provider: provider.name,
        status: DatabaseCallStatus.DIALING,
      },
      where: {
        id: call.id,
        providerCallId: null,
        run: { status: { in: [...CALL_STARTABLE_RUN_STATUSES] } },
        status: DatabaseCallStatus.QUEUED,
      },
    });
    if (claimed.count === 0) return;

    const specification = this.parseSpecification(
      run.specificationVersion.specification,
    );
    const business = businessContract(call.business);
    const callbackBaseUrl = this.configuration.api.publicUrl;
    if (callbackBaseUrl === undefined) {
      throw new NonRetryableQueueError(
        "API_PUBLIC_URL is required before provider calls can start.",
      );
    }
    const started = await provider.startCall(
      {
        business,
        callbackUrl: `${callbackBaseUrl}/api/v1/webhooks/elevenlabs`,
        disclosure: {
          identifyAsAiWhenAsked: true,
          recordingDisclosure:
            "This call may be recorded and transcribed for quote evidence.",
        },
        job: specification,
        locale: call.locale,
        representedAs,
        strategy: envelope.payload.strategy,
        ...(truthfulLeverage === undefined ? {} : { truthfulLeverage }),
      },
      this.providerContext(envelope, context),
    );
    if (!started.ok) {
      const safeToRetry =
        started.error.retryable && started.error.code === "rate-limited";
      if (safeToRetry && context.attempt < context.attemptsAllowed) {
        const released = await client.call.updateMany({
          data: {
            failureCode: started.error.code,
            failureMessage: started.error.message,
            status: DatabaseCallStatus.QUEUED,
          },
          where: {
            id: call.id,
            providerCallId: null,
            run: { status: { in: [...CALL_STARTABLE_RUN_STATUSES] } },
            status: DatabaseCallStatus.DIALING,
          },
        });
        if (released.count === 0) {
          await this.restorePausedCallClaim(call.id);
          return;
        }
        throw new ProviderOperationError(started.error);
      }
      const failed = await this.failCallStart(
        call.id,
        run.id,
        started.error,
        envelope,
      );
      if (!failed) {
        await this.restorePausedCallClaim(call.id);
        return;
      }
      await this.enqueueRank(
        run.id,
        `call-start-failed:${call.id}`,
        envelope.traceId,
      );
      throw new NonRetryableQueueError(
        started.error.code === "timeout" || started.error.code === "unavailable"
          ? "Call start became uncertain and will not be repeated automatically."
          : `Call provider rejected the request (${started.error.code}).`,
      );
    }

    const submittedAt = new Date(started.value.submittedAt);
    const registeredCall = await client.$transaction(async (transaction) => {
      const activatedRun = await transaction.negotiationRun.updateMany({
        data: {
          startedAt: run.startedAt ?? submittedAt,
          status: NegotiationRunStatus.CALLING,
        },
        where: {
          id: run.id,
          status: { in: [...CALL_STARTABLE_RUN_STATUSES] },
        },
      });
      await transaction.call.updateMany({
        data: {
          aiDisclosureMadeAt: submittedAt,
          providerCallId: started.value.providerCallId,
          recordingConsentAt: run.recordingConsentAt,
          startedAt: submittedAt,
        },
        where: {
          id: call.id,
          providerCallId: null,
        },
      });
      if (activatedRun.count > 0) {
        await transaction.job.updateMany({
          data: { status: JobStatus.CALLING },
          where: {
            id: call.jobId,
            status: {
              notIn: [
                JobStatus.CANCELLED,
                JobStatus.COMPLETED,
                JobStatus.FAILED,
              ],
            },
          },
        });
      }
      return transaction.call.findUnique({
        include: { run: { select: { status: true } } },
        where: { id: call.id },
      });
    });
    if (
      registeredCall === null ||
      registeredCall.providerCallId !== started.value.providerCallId
    ) {
      const cancellation = await provider.cancelCall(
        started.value.providerCallId,
        this.providerContext(envelope, context),
      );
      if (!cancellation.ok && cancellation.error.code !== "not-found") {
        this.throwProviderFailure(cancellation.error);
      }
      throw new NonRetryableQueueError(
        "The provider call could not be registered and was cancelled to prevent an orphaned call.",
      );
    }
    await this.reconcilePendingCallWebhooks(
      {
        id: registeredCall.id,
        jobId: registeredCall.jobId,
        providerCallId: started.value.providerCallId,
        runId: run.id,
      },
      provider.name,
      envelope.traceId,
    );
    if (registeredCall.run?.status === NegotiationRunStatus.PAUSED) {
      await this.pauseRegisteredProviderCall(
        {
          id: registeredCall.id,
          providerCallId: started.value.providerCallId,
          structuredOutcome: registeredCall.structuredOutcome,
        },
        envelope.payload,
        run.id,
        provider,
        envelope,
        context,
      );
      return;
    }
    if (
      registeredCall.status === DatabaseCallStatus.CANCELLED ||
      registeredCall.run === null ||
      TERMINAL_RUN_STATUSES.has(registeredCall.run.status)
    ) {
      if (!TERMINAL_CALL_STATUSES.has(registeredCall.status)) {
        await client.call.updateMany({
          data: {
            endedAt: new Date(),
            status: DatabaseCallStatus.CANCELLED,
          },
          where: {
            id: registeredCall.id,
            providerCallId: registeredCall.providerCallId,
            status: { notIn: [...TERMINAL_CALL_STATUSES] },
          },
        });
      }
      await this.cancelRegisteredProviderCall(
        {
          id: registeredCall.id,
          providerCallId: started.value.providerCallId,
          structuredOutcome: registeredCall.structuredOutcome,
        },
        run.id,
        provider,
        envelope,
        context,
      );
      return;
    }
    await this.appendRunEvent(
      run.id,
      "call.started",
      AuditActor.PROVIDER,
      { businessId: call.businessId, callId: call.id, provider: provider.name },
      `${envelope.idempotencyKey}:started`,
    );
    await this.enqueueOutcomePoll(
      call.id,
      run.id,
      started.value.providerCallId,
      envelope.traceId,
    );
    await context.updateProgress(100);
  }

  async cancelCall(
    envelope: QueueJobEnvelope<"call.cancel">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const provider = this.requireProvider(
      this.providers.calls,
      "call cancellation",
    );
    const client = this.database.client;
    const call = await client.call.findUnique({
      include: { negotiation: true, run: true },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.run === null ||
      call.runId !== envelope.payload.runId
    ) {
      throw new NonRetryableQueueError(
        "The cancellation job does not match its call run.",
      );
    }
    const providerCallId =
      envelope.payload.providerCallId ?? call.providerCallId;
    if (providerCallId === null) return;
    if (
      envelope.payload.providerCallId !== undefined &&
      envelope.payload.providerCallId !== call.providerCallId
    ) {
      const cancellationHistory = Array.isArray(
        asRecord(call.structuredOutcome).pausedProviderCancellations,
      )
        ? (asRecord(call.structuredOutcome)
            .pausedProviderCancellations as unknown[])
        : [];
      const isKnownPausedSession = cancellationHistory.some(
        (entry) =>
          optionalString(asRecord(entry).providerCallId) === providerCallId,
      );
      if (
        envelope.payload.resumable !== true ||
        call.providerCallId !== null ||
        !isKnownPausedSession
      ) {
        return;
      }
    }

    if (
      envelope.payload.resumable === true &&
      (call.run.status === NegotiationRunStatus.PAUSED ||
        call.run.status === NegotiationRunStatus.CALLING)
    ) {
      await this.pauseRegisteredProviderCall(
        {
          id: call.id,
          providerCallId,
          structuredOutcome: call.structuredOutcome,
        },
        this.callPlacementPayload(call, call.run),
        call.runId,
        provider,
        envelope,
        context,
      );
      return;
    }
    if (call.status !== DatabaseCallStatus.CANCELLED) {
      throw new NonRetryableQueueError(
        "A provider call can be cancelled only after Relay records the cancellation.",
      );
    }
    const outcome = asRecord(call.structuredOutcome);
    if (optionalString(outcome.providerCancellationCompletedAt) !== undefined)
      return;
    await this.cancelRegisteredProviderCall(
      {
        id: call.id,
        providerCallId,
        structuredOutcome: call.structuredOutcome,
      },
      call.runId,
      provider,
      envelope,
      context,
    );
  }

  async processCallOutcome(
    envelope: QueueJobEnvelope<"call.outcome.process">,
    context: QueueProcessingContext,
  ): Promise<void> {
    try {
      await this.processCallOutcomeAttempt(envelope, context);
    } catch (error) {
      if (
        !(error instanceof CallStillInProgressError) &&
        (error instanceof NonRetryableQueueError ||
          context.attempt >= context.attemptsAllowed)
      ) {
        await this.compensateCallProcessingFailure(envelope, error, context);
      }
      throw error;
    }
  }

  private async processCallOutcomeAttempt(
    envelope: QueueJobEnvelope<"call.outcome.process">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const provider = this.requireProvider(this.providers.calls, "call status");
    const client = this.database.client;
    let call = await client.call.findUnique({
      include: {
        job: { include: { user: true } },
        negotiation: true,
        run: true,
      },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.run === null ||
      call.runId !== envelope.payload.runId
    ) {
      throw new NonRetryableQueueError(
        "The outcome job does not match its call run.",
      );
    }
    if (call.providerCallId === null) {
      if (
        call.status === DatabaseCallStatus.QUEUED ||
        TERMINAL_CALL_STATUSES.has(call.status)
      ) {
        return;
      }
      throw new NonRetryableQueueError(
        "The call has no registered provider identifier.",
      );
    }
    const polledProviderCallId = envelope.payload.providerEventId.startsWith(
      "poll:",
    )
      ? envelope.payload.providerEventId.slice("poll:".length)
      : undefined;
    if (
      polledProviderCallId !== undefined &&
      polledProviderCallId !== call.providerCallId
    ) {
      return;
    }
    const run = call.run;
    const providerCallId = call.providerCallId;

    if (
      run.status === NegotiationRunStatus.PAUSED &&
      call.status !== DatabaseCallStatus.COMPLETED &&
      call.status !== DatabaseCallStatus.FAILED
    ) {
      await this.pauseRegisteredProviderCall(
        {
          id: call.id,
          providerCallId,
          structuredOutcome: call.structuredOutcome,
        },
        this.callPlacementPayload(call, run),
        run.id,
        provider,
        envelope,
        context,
      );
      return;
    }
    if (
      call.status === DatabaseCallStatus.CANCELLED ||
      run.status === NegotiationRunStatus.CANCELLED
    ) {
      if (call.status !== DatabaseCallStatus.CANCELLED) {
        await client.call.update({
          data: {
            endedAt: call.endedAt ?? new Date(),
            status: DatabaseCallStatus.CANCELLED,
          },
          where: { id: call.id },
        });
        call = { ...call, status: DatabaseCallStatus.CANCELLED };
      }
      await this.cancelRegisteredProviderCall(
        {
          id: call.id,
          providerCallId,
          structuredOutcome: call.structuredOutcome,
        },
        run.id,
        provider,
        envelope,
        context,
      );
      return;
    }
    if (
      TERMINAL_CALL_STATUSES.has(call.status) &&
      extractionIsSettled(call.structuredOutcome)
    ) {
      if (call.transcriptText !== null) {
        await client.call.update({
          data: { transcriptText: null },
          where: { id: call.id },
        });
      }
      await this.enqueueRank(
        run.id,
        `terminal-processed:${call.id}`,
        envelope.traceId,
      );
      return;
    }

    const claimMarker = `OUTCOME_PROCESSING:${envelope.idempotencyKey}`;
    if (
      call.failureCode?.startsWith("OUTCOME_PROCESSING:") === true &&
      call.failureCode !== claimMarker
    ) {
      return;
    }
    if (call.failureCode !== claimMarker) {
      const claimed = await client.call.updateMany({
        data: { failureCode: claimMarker },
        where: {
          id: call.id,
          OR: [
            { failureCode: null },
            { failureCode: { not: { startsWith: "OUTCOME_PROCESSING:" } } },
          ],
        },
      });
      if (claimed.count === 0) return;
      call = { ...call, failureCode: claimMarker };
    }

    const snapshot = await provider.getCall(
      providerCallId,
      this.providerContext(envelope, context),
    );
    if (!snapshot.ok && !TERMINAL_CALL_STATUSES.has(call.status)) {
      await this.releaseOutcomeClaim(call.id, claimMarker);
      this.throwProviderFailure(snapshot.error);
    }
    const incomingStatus = snapshot.ok
      ? databaseCallStatus(snapshot.value.status)
      : call.status;
    const status = monotonicCallStatus(call.status, incomingStatus);
    const transcript =
      snapshot.ok && snapshot.value.transcriptText?.trim()
        ? snapshot.value.transcriptText.trim()
        : call.transcriptText;
    const now = new Date();
    const endedAt = TERMINAL_CALL_STATUSES.has(status)
      ? (call.endedAt ?? now)
      : call.endedAt;
    await client.call.update({
      data: {
        endedAt,
        failureCode:
          status === DatabaseCallStatus.FAILED
            ? "provider_call_failed"
            : claimMarker,
        failureMessage:
          status === DatabaseCallStatus.FAILED
            ? "The provider reported that the call failed."
            : null,
        startedAt:
          call.startedAt ??
          (statusProgress(status) > 0
            ? snapshot.ok
              ? new Date(snapshot.value.updatedAt)
              : now
            : null),
        status,
        transcriptText: transcript,
      },
      where: { id: call.id },
    });
    await this.appendRunEvent(
      run.id,
      TERMINAL_CALL_STATUSES.has(status) ? "call.completed" : "call.updated",
      AuditActor.PROVIDER,
      {
        callId: call.id,
        providerEventId: envelope.payload.providerEventId,
        status: status.toLowerCase(),
      },
      `${envelope.idempotencyKey}:status:${status}`,
    );

    if (!TERMINAL_CALL_STATUSES.has(status)) {
      await this.releaseOutcomeClaim(call.id, claimMarker);
      if (context.attempt >= context.attemptsAllowed) {
        await this.compensateCallProcessingFailure(
          envelope,
          new Error("The provider call outcome polling window expired."),
          context,
        );
        return;
      }
      throw new CallStillInProgressError(status);
    }
    if (status !== DatabaseCallStatus.COMPLETED) {
      await client.call.update({
        data: {
          failureCode:
            status === DatabaseCallStatus.CANCELLED
              ? null
              : "provider_call_failed",
          structuredOutcome: mergeJson(call.structuredOutcome, {
            extraction: "skipped",
            outcome:
              status === DatabaseCallStatus.CANCELLED ? "cancelled" : "failed",
          }),
          transcriptText: null,
        },
        where: { id: call.id },
      });
      await this.enqueueRank(run.id, `terminal:${call.id}`, envelope.traceId);
      return;
    }

    const retentionUntil = new Date(
      now.getTime() +
        evidenceRetentionDays(call.job.user?.settings ?? null) *
          MILLISECONDS_PER_DAY,
    );
    let transcriptKey: string | undefined;
    if (transcript !== null && transcript.trim().length > 0) {
      transcriptKey = `runs/${run.id}/calls/${call.id}/transcript.txt`;
      await this.persistEvidence(
        {
          body: new TextEncoder().encode(transcript),
          callId: call.id,
          contentType: "text/plain",
          jobId: call.jobId,
          key: transcriptKey,
          kind: EvidenceKind.TRANSCRIPT,
          metadata: { provider: provider.name },
          retentionUntil,
          runId: run.id,
        },
        envelope,
        context,
      );
    }

    let recordingKey: string | undefined;
    let recordingFailure: ProviderFailure | undefined;
    if (run.recordingConsentAt !== null) {
      const recording = await provider.getRecording(
        providerCallId,
        this.providerContext(envelope, context),
      );
      if (recording.ok) {
        const extension =
          recording.value.contentType === "audio/wav" ? "wav" : "mp3";
        recordingKey = `runs/${run.id}/calls/${call.id}/recording.${extension}`;
        await this.persistEvidence(
          {
            body: recording.value.body,
            callId: call.id,
            contentType: recording.value.contentType,
            jobId: call.jobId,
            key: recordingKey,
            kind: EvidenceKind.RECORDING,
            metadata: { provider: provider.name },
            retentionUntil,
            runId: run.id,
          },
          envelope,
          context,
        );
      } else {
        recordingFailure = recording.error;
      }
    }

    const classifiedOutcome = classifyNonQuoteOutcome(
      snapshot.ok ? snapshot.value.outcome?.outcome : undefined,
      transcript,
    );
    if (classifiedOutcome !== undefined) {
      await client.$transaction([
        client.call.update({
          data: {
            failureCode: null,
            ...(recordingKey === undefined
              ? {}
              : { recordingStorageKey: recordingKey }),
            structuredOutcome: mergeJson(call.structuredOutcome, {
              extraction: "skipped",
              outcome: classifiedOutcome,
              ...(recordingFailure === undefined
                ? {}
                : { recordingFailureCode: recordingFailure.code }),
              ...(recordingKey === undefined ? {} : { recordingKey }),
              ...(transcriptKey === undefined ? {} : { transcriptKey }),
            }),
            transcriptText: null,
          },
          where: { id: call.id },
        }),
        ...(call.negotiationId === null
          ? []
          : [
              client.negotiation.update({
                data: {
                  endedAt: call.endedAt ?? now,
                  status:
                    classifiedOutcome === "declined"
                      ? NegotiationStatus.DECLINED
                      : NegotiationStatus.FAILED,
                },
                where: { id: call.negotiationId },
              }),
            ]),
      ]);
      await this.appendRunEvent(
        run.id,
        "call.updated",
        AuditActor.WORKER,
        { callId: call.id, outcome: classifiedOutcome },
        `${envelope.idempotencyKey}:outcome:${classifiedOutcome}`,
      );
      await this.enqueueRank(
        run.id,
        `non-quote:${call.id}:${classifiedOutcome}`,
        envelope.traceId,
      );
      return;
    }

    if (transcriptKey === undefined) {
      await client.call.update({
        data: {
          failureCode: null,
          structuredOutcome: mergeJson(call.structuredOutcome, {
            extraction: "skipped",
            outcome: "unavailable",
            reason: "The provider completed without transcript evidence.",
            ...(recordingFailure === undefined
              ? {}
              : { recordingFailureCode: recordingFailure.code }),
          }),
          transcriptText: null,
        },
        where: { id: call.id },
      });
      await this.enqueueRank(
        run.id,
        `no-transcript:${call.id}`,
        envelope.traceId,
      );
      return;
    }

    const quoteId = deterministicId("quote", run.id, call.id);
    await client.call.update({
      data: {
        failureCode: null,
        ...(recordingKey === undefined
          ? {}
          : { recordingStorageKey: recordingKey }),
        structuredOutcome: mergeJson(call.structuredOutcome, {
          extraction: "queued",
          pendingQuoteId: quoteId,
          transcriptKey,
          ...(recordingKey === undefined ? {} : { recordingKey }),
          ...(recordingFailure === undefined
            ? {}
            : { recordingFailureCode: recordingFailure.code }),
        }),
      },
      where: { id: call.id },
    });
    await this.queue.enqueue(
      createQueueJob(
        queueJobNames.normalizeQuote,
        { callId: call.id, quoteId, runId: run.id },
        {
          idempotencyKey: `${run.id}:normalize:${quoteId}`,
          traceId: envelope.traceId,
        },
      ),
    );
    if (
      recordingFailure?.retryable === true &&
      context.attempt < context.attemptsAllowed
    ) {
      throw new ProviderOperationError(recordingFailure);
    }
    await context.updateProgress(100);
  }

  async normalizeQuote(
    envelope: QueueJobEnvelope<"quote.normalize">,
    context: QueueProcessingContext,
  ): Promise<void> {
    try {
      await this.normalizeQuoteAttempt(envelope, context);
    } catch (error) {
      if (
        error instanceof NonRetryableQueueError ||
        context.attempt >= context.attemptsAllowed
      ) {
        await this.compensateQuoteProcessingFailure(envelope, error);
      }
      throw error;
    }
  }

  private async normalizeQuoteAttempt(
    envelope: QueueJobEnvelope<"quote.normalize">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const extraction = this.requireProvider(
      this.providers.extraction,
      "quote extraction",
    );
    const client = this.database.client;
    const existing = await client.quote.findUnique({
      where: { id: envelope.payload.quoteId },
    });
    if (existing !== null) {
      await client.call.updateMany({
        data: { transcriptText: null },
        where: { id: envelope.payload.callId, runId: envelope.payload.runId },
      });
      await this.enqueueRank(
        envelope.payload.runId,
        `normalized:${existing.id}`,
        envelope.traceId,
      );
      return;
    }
    const call = await client.call.findUnique({
      include: {
        business: true,
        evidence: true,
        job: true,
        negotiation: true,
        run: true,
      },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.run === null ||
      call.runId !== envelope.payload.runId ||
      call.transcriptText === null ||
      call.status !== DatabaseCallStatus.COMPLETED
    ) {
      throw new NonRetryableQueueError(
        "Quote normalization requires a completed, evidenced call from the same run.",
      );
    }
    const run = call.run;
    const transcriptEvidence = call.evidence.find(
      (item) => item.kind === EvidenceKind.TRANSCRIPT,
    );
    if (transcriptEvidence === undefined) {
      throw new NonRetryableQueueError(
        "Quote normalization cannot run without persisted transcript evidence.",
      );
    }
    const recordingEvidence = call.evidence.find(
      (item) => item.kind === EvidenceKind.RECORDING,
    );
    const result = await extraction.extractQuote(
      {
        businessId: call.businessId,
        defaultCurrency: call.job.currency as Quote["totalPrice"]["currency"],
        evidence: {
          callId: call.id,
          excerpt: call.transcriptText.slice(0, 2_000),
          source: "phone_call",
          transcriptKey: transcriptEvidence.storageKey,
          ...(recordingEvidence === undefined
            ? {}
            : { recordingKey: recordingEvidence.storageKey }),
        },
        input: { kind: "text", text: call.transcriptText },
        jobId: call.jobId,
        quoteId: envelope.payload.quoteId,
        status: "final",
        ...(call.endedAt === null
          ? {}
          : { capturedAt: call.endedAt.toISOString() }),
      },
      this.providerContext(envelope, context),
    );
    if (!result.ok) {
      if (result.error.retryable && context.attempt < context.attemptsAllowed) {
        throw new ProviderOperationError(result.error);
      }
      await client.call.update({
        data: {
          structuredOutcome: mergeJson(call.structuredOutcome, {
            extraction: "failed",
            extractionFailureCode: result.error.code,
          }),
          transcriptText: null,
        },
        where: { id: call.id },
      });
      await this.enqueueRank(
        run.id,
        `extraction-failed:${call.id}`,
        envelope.traceId,
      );
      throw new NonRetryableQueueError(
        `Quote extraction failed (${result.error.code}).`,
      );
    }

    const quote = result.value.quote;
    const discount = quote.discount?.amountMinor ?? 0;
    const retentionUntil =
      transcriptEvidence.retentionUntil ??
      new Date(
        Date.now() + DEFAULT_EVIDENCE_RETENTION_DAYS * MILLISECONDS_PER_DAY,
      );
    const structuredKey = `runs/${run.id}/calls/${call.id}/quote.json`;
    const structuredBody = new TextEncoder().encode(
      JSON.stringify({
        quote,
        sourceSummary: result.value.sourceSummary,
        warnings: result.value.warnings,
      }),
    );
    await this.persistEvidence(
      {
        body: structuredBody,
        callId: call.id,
        contentType: "application/json",
        jobId: call.jobId,
        key: structuredKey,
        kind: EvidenceKind.STRUCTURED_EXTRACTION,
        metadata: { provider: extraction.name },
        retentionUntil,
        runId: run.id,
      },
      envelope,
      context,
    );

    const estimateType = databaseEstimateType(quote.estimateType);
    const savedAmount =
      quote.discount?.currency === quote.totalPrice.currency ? discount : 0;
    await client.$transaction(async (transaction) => {
      if (call.negotiationId !== null) {
        await transaction.quote.updateMany({
          data: { score: null, status: QuoteStatus.WITHDRAWN },
          where: {
            id: { not: quote.id },
            negotiationId: call.negotiationId,
            status: { not: QuoteStatus.WITHDRAWN },
          },
        });
      }
      await transaction.quote.upsert({
        create: {
          businessId: call.businessId,
          callId: call.id,
          completeness: quote.completeness ?? null,
          confidence: quote.confidence,
          currency: quote.totalPrice.currency,
          depositAmountCents: quote.terms?.deposit?.amountMinor ?? null,
          estimatedHours: quote.estimatedHours ?? null,
          estimateType: estimateType ?? null,
          id: quote.id,
          jobId: call.jobId,
          maximumAmountCents: quote.priceRange?.maximum.amountMinor ?? null,
          minimumAmountCents: quote.priceRange?.minimum.amountMinor ?? null,
          negotiatedSavingCents: savedAmount,
          negotiationId: call.negotiationId,
          originalAmountCents:
            savedAmount > 0 ? quote.totalPrice.amountMinor + savedAmount : null,
          pricingModel: databasePricingModel(quote.pricingModel),
          runId: run.id,
          status: databaseQuoteStatus(quote.status),
          terms: toJson({
            ...(quote.terms ?? {}),
            basePrice: quote.basePrice,
            hourlyRate: quote.hourlyRate,
            minimumHours: quote.minimumHours,
            sourceSummary: result.value.sourceSummary,
            tax: quote.tax,
            warnings: result.value.warnings,
          }),
          totalAmountCents: quote.totalPrice.amountMinor,
          validUntil:
            quote.validUntil === undefined ? null : new Date(quote.validUntil),
        },
        update: {},
        where: { id: quote.id },
      });
      for (const [index, fee] of quote.fees.entries()) {
        await transaction.quoteItem.upsert({
          create: {
            category: fee.category,
            disclosed: fee.disclosed,
            feeCode: fee.code,
            includedInTotal: fee.includedInTotal,
            label: fee.label,
            lineNumber: index + 1,
            quoteId: quote.id,
            required: fee.required,
            totalAmountCents: fee.amount?.amountMinor ?? null,
          },
          update: {},
          where: {
            quoteId_lineNumber: { lineNumber: index + 1, quoteId: quote.id },
          },
        });
      }
      await transaction.evidence.updateMany({
        data: { quoteId: quote.id },
        where: { callId: call.id, quoteId: null },
      });
      await transaction.call.update({
        data: {
          structuredOutcome: mergeJson(call.structuredOutcome, {
            extraction: "completed",
            outcome: "quote_received",
            quoteId: quote.id,
          }),
          transcriptText: null,
        },
        where: { id: call.id },
      });
      if (call.negotiation !== null) {
        await transaction.negotiation.update({
          data: {
            endedAt: call.endedAt ?? new Date(),
            finalAmountCents: quote.totalPrice.amountMinor,
            savingsAmountCents: savedAmount,
            status:
              savedAmount > 0
                ? NegotiationStatus.IMPROVED
                : NegotiationStatus.UNCHANGED,
          },
          where: { id: call.negotiation.id },
        });
      }
    });
    await this.appendRunEvent(
      run.id,
      "quote.captured",
      AuditActor.WORKER,
      { businessId: call.businessId, callId: call.id, quoteId: quote.id },
      `${envelope.idempotencyKey}:captured`,
    );
    await this.enqueueRank(run.id, `normalized:${quote.id}`, envelope.traceId);
    await context.updateProgress(100);
  }

  async rankRunQuotes(
    envelope: QueueJobEnvelope<"quote.rank">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const client = this.database.client;
    const run = await client.negotiationRun.findUnique({
      include: rankingRunInclude,
      where: { id: envelope.payload.runId },
    });
    if (run === null) {
      throw new NonRetryableQueueError("The quote ranking run does not exist.");
    }
    if (
      run.status === NegotiationRunStatus.CANCELLED ||
      run.status === NegotiationRunStatus.PAUSED
    )
      return;

    const activeQuoteIds = selectLatestActiveQuoteIds(run.quotes);
    const activeQuotes = run.quotes.filter((quote) =>
      activeQuoteIds.has(quote.id),
    );
    const candidates = activeQuotes.flatMap((record) => {
      const quote = rankingQuoteContract(record);
      if (
        quote === undefined ||
        quote.totalPrice.currency !== run.job.currency
      ) {
        return [];
      }
      return [
        {
          business: {
            ...(record.business.rating === null
              ? {}
              : { rating: Number(record.business.rating) }),
            ...(record.business.reviewCount === null
              ? {}
              : { reviewCount: record.business.reviewCount }),
          },
          quote,
        },
      ];
    });
    const rankings = rankQuotes(candidates, {
      referenceTime: new Date().toISOString(),
      requireEvidence: true,
    });
    await Promise.all(
      rankings.map(async (ranking) =>
        client.quote.update({
          data: {
            riskFlags: toJson(ranking.redFlags),
            score: ranking.totalScore,
          },
          where: { id: ranking.quoteId },
        }),
      ),
    );

    const bestRanking = rankings.find((ranking) => ranking.eligible);
    const bestQuote =
      bestRanking === undefined
        ? undefined
        : activeQuotes.find((quote) => quote.id === bestRanking.quoteId);
    const savings = bestQuote?.negotiatedSavingCents ?? 0;
    const explanation = bestQuote
      ? `${bestQuote.business.name} is the strongest evidenced value after price, completeness, confidence, reputation, and risk checks.`
      : "No eligible evidenced quote is available.";
    await client.recommendation.upsert({
      create: {
        bestQuoteId: bestQuote?.id ?? null,
        configurationVersion: run.configurationVersion,
        currency: bestQuote?.currency ?? run.job.currency,
        explanation,
        factors: toJson(rankings),
        policyVersion: "quote-ranking-v1",
        rankedQuoteIds: toJson(rankings.map((ranking) => ranking.quoteId)),
        runId: run.id,
        savingsAmountCents: savings,
      },
      update: {
        bestQuoteId: bestQuote?.id ?? null,
        currency: bestQuote?.currency ?? run.job.currency,
        explanation,
        factors: toJson(rankings),
        rankedQuoteIds: toJson(rankings.map((ranking) => ranking.quoteId)),
        savingsAmountCents: savings,
      },
      where: { runId: run.id },
    });

    const pendingExtraction = run.calls.some((call) => {
      const extraction = asRecord(call.structuredOutcome).extraction;
      return extraction === "queued" || extraction === "processing";
    });
    const allCallsTerminal =
      run.calls.length > 0 &&
      run.calls.every((call) => TERMINAL_CALL_STATUSES.has(call.status));
    if (!allCallsTerminal || pendingExtraction) {
      await context.updateProgress({ pending: true, quotes: rankings.length });
      return;
    }

    const followUps = selectEvidenceBackedContinuations({
      eligibleQuoteIds: new Set(
        rankings
          .filter((ranking) => ranking.eligible)
          .map((ranking) => ranking.quoteId),
      ),
      expectedCurrency: run.job.currency,
      negotiations: run.negotiations,
      quotes: run.quotes,
    });
    for (const followUp of followUps) {
      await this.queue.enqueue(
        createQueueJob(
          queueJobNames.continueNegotiation,
          {
            currentQuoteId: followUp.currentQuoteId,
            negotiationId: followUp.negotiationId,
            runId: run.id,
            truthfulCompetingQuoteId: followUp.truthfulCompetingQuoteId,
          },
          {
            idempotencyKey: `${run.id}:continue:${followUp.negotiationId}:round:1:${followUp.currentQuoteId}:${followUp.truthfulCompetingQuoteId}`,
            traceId: envelope.traceId,
          },
        ),
      );
    }
    if (followUps.length > 0) {
      await context.updateProgress({
        followUpsScheduled: followUps.length,
        pending: true,
        quotes: rankings.length,
      });
      return;
    }

    const callsWithQuotes = new Set(run.quotes.map((quote) => quote.callId));
    const incompleteCalls = run.calls.filter(
      (call) => !callsWithQuotes.has(call.id),
    ).length;
    const terminalStatus =
      bestQuote === undefined
        ? NegotiationRunStatus.FAILED
        : incompleteCalls > 0
          ? NegotiationRunStatus.PARTIALLY_COMPLETED
          : NegotiationRunStatus.COMPLETED;
    const completedAt = new Date();
    const finalized = await client.$transaction(async (transaction) => {
      const terminalized = await transaction.negotiationRun.updateMany({
        data: {
          completedAt,
          failureCode:
            terminalStatus === NegotiationRunStatus.FAILED
              ? "no_eligible_quotes"
              : null,
          failureMessage:
            terminalStatus === NegotiationRunStatus.FAILED
              ? "No evidenced quote could be normalized and ranked."
              : null,
          status: terminalStatus,
        },
        where: {
          id: run.id,
          status: {
            in: [
              NegotiationRunStatus.QUEUED,
              NegotiationRunStatus.CALLING,
              NegotiationRunStatus.COMPARING,
            ],
          },
        },
      });
      if (terminalized.count === 0) return false;
      await transaction.job.updateMany({
        data: {
          completedAt,
          status:
            terminalStatus === NegotiationRunStatus.FAILED
              ? JobStatus.FAILED
              : JobStatus.COMPLETED,
        },
        where: {
          id: run.jobId,
          status: {
            notIn: [JobStatus.CANCELLED, JobStatus.COMPLETED, JobStatus.FAILED],
          },
        },
      });
      return true;
    });
    if (!finalized) return;
    await this.appendRunEvent(
      run.id,
      "run.status_changed",
      AuditActor.WORKER,
      { status: terminalStatus.toLowerCase() },
      `${run.id}:terminal:${terminalStatus}`,
    );
    await this.appendRunEvent(
      run.id,
      "recommendation.ready",
      AuditActor.WORKER,
      { bestQuoteId: bestQuote?.id ?? null, quoteCount: rankings.length },
      `${run.id}:recommendation:ready`,
    );
    await context.updateProgress(100);
  }

  async continueNegotiation(
    envelope: QueueJobEnvelope<"negotiation.continue">,
    context: QueueProcessingContext,
  ): Promise<void> {
    try {
      await this.continueNegotiationAttempt(envelope);
    } catch (error) {
      if (
        error instanceof NonRetryableQueueError ||
        context.attempt >= context.attemptsAllowed
      ) {
        try {
          await this.compensateContinuationFailure(envelope, error);
        } catch (compensationError) {
          throw new AggregateError(
            [error, compensationError],
            "Negotiation continuation and its terminal compensation failed.",
            { cause: compensationError },
          );
        }
      }
      throw error;
    }
  }

  private async continueNegotiationAttempt(
    envelope: QueueJobEnvelope<"negotiation.continue">,
  ): Promise<void> {
    const provider = this.requireProvider(
      this.providers.calls,
      "negotiation continuation",
    );
    const client = this.database.client;
    const negotiation = await client.negotiation.findUnique({
      include: {
        calls: { orderBy: { createdAt: "desc" } },
        run: { include: { job: true } },
      },
      where: { id: envelope.payload.negotiationId },
    });
    if (
      negotiation === null ||
      negotiation.run === null ||
      negotiation.runId !== envelope.payload.runId
    ) {
      throw new NonRetryableQueueError(
        "The continuation job does not match its negotiation run.",
      );
    }
    const run = negotiation.run;
    if (
      TERMINAL_RUN_STATUSES.has(run.status) ||
      run.status === NegotiationRunStatus.PAUSED
    ) {
      return;
    }
    const callId = deterministicId(
      "call",
      negotiation.id,
      envelope.idempotencyKey,
    );
    const existingCall = await client.call.findUnique({
      where: { id: callId },
    });
    if (existingCall !== null) {
      if (TERMINAL_CALL_STATUSES.has(existingCall.status)) {
        await this.enqueueRank(
          run.id,
          `continuation-terminal:${existingCall.id}`,
          envelope.traceId,
        );
        return;
      }
      if (existingCall.providerCallId !== null) {
        await this.enqueuePlaceCall(
          envelope,
          {
            businessId: negotiation.businessId,
            runId: run.id,
            specificationVersionId: run.specificationVersionId,
            strategy: negotiation.strategy,
          },
          existingCall.id,
        );
        return;
      }
    }

    if (
      existingCall === null &&
      negotiation.currentRound >= MAX_FOLLOW_UP_ROUNDS
    )
      return;
    const activeCall = negotiation.calls.find(
      (call) => call.id !== callId && !TERMINAL_CALL_STATUSES.has(call.status),
    );
    if (activeCall !== undefined) return;

    await this.loadTruthfulLeverage({
      businessId: negotiation.businessId,
      currentQuoteId: envelope.payload.currentQuoteId,
      expectedCurrency: run.job.currency,
      negotiationId: negotiation.id,
      runId: run.id,
      truthfulCompetingQuoteId: envelope.payload.truthfulCompetingQuoteId,
    });

    const nextRound =
      existingCall === null
        ? negotiation.currentRound + 1
        : negotiation.currentRound;
    if (existingCall === null) {
      await client.$transaction([
        client.negotiation.update({
          data: {
            currentRound: nextRound,
            metadata: mergeJson(negotiation.metadata, {
              currentQuoteId: envelope.payload.currentQuoteId,
              truthfulCompetingQuoteId:
                envelope.payload.truthfulCompetingQuoteId,
            }),
            startedAt: negotiation.startedAt ?? new Date(),
            status: NegotiationStatus.IN_PROGRESS,
          },
          where: { id: negotiation.id },
        }),
        client.call.create({
          data: {
            aiDisclosureMadeAt: run.aiDisclosureAcknowledgedAt,
            businessId: negotiation.businessId,
            id: callId,
            jobId: negotiation.jobId,
            negotiationId: negotiation.id,
            provider: provider.name,
            recordingConsentAt: run.recordingConsentAt,
            runId: run.id,
            status: DatabaseCallStatus.QUEUED,
          },
        }),
      ]);
    }
    await this.appendRunEvent(
      run.id,
      "call.queued",
      AuditActor.WORKER,
      { businessId: negotiation.businessId, callId, round: nextRound },
      `${envelope.idempotencyKey}:call:${callId}`,
    );
    await this.enqueuePlaceCall(
      envelope,
      {
        businessId: negotiation.businessId,
        runId: run.id,
        specificationVersionId: run.specificationVersionId,
        strategy: negotiation.strategy,
      },
      callId,
    );
  }

  private async enqueuePlaceCall(
    envelope: QueueJobEnvelope<"negotiation.continue">,
    negotiation: {
      readonly businessId: string;
      readonly runId: string;
      readonly specificationVersionId: string;
      readonly strategy: DatabaseNegotiationStrategy;
    },
    callId: string,
  ): Promise<void> {
    await this.queue.enqueue(
      createQueueJob(
        queueJobNames.placeCall,
        {
          businessId: negotiation.businessId,
          callId,
          currentQuoteId: envelope.payload.currentQuoteId,
          runId: negotiation.runId,
          specificationVersionId: negotiation.specificationVersionId,
          strategy: contractStrategy(negotiation.strategy),
          truthfulCompetingQuoteId: envelope.payload.truthfulCompetingQuoteId,
        },
        {
          idempotencyKey: `${callId}:place`,
          traceId: envelope.traceId,
        },
      ),
    );
  }

  private async loadTruthfulLeverage(input: {
    readonly businessId: string;
    readonly currentQuoteId: string | undefined;
    readonly expectedCurrency: string;
    readonly negotiationId: string | null;
    readonly runId: string;
    readonly truthfulCompetingQuoteId: string | undefined;
  }): Promise<TruthfulCallLeverage | undefined> {
    const hasCurrent = input.currentQuoteId !== undefined;
    const hasCompeting = input.truthfulCompetingQuoteId !== undefined;
    if (!hasCurrent && !hasCompeting) return undefined;
    if (
      !hasCurrent ||
      !hasCompeting ||
      input.negotiationId === null ||
      input.currentQuoteId === undefined ||
      input.truthfulCompetingQuoteId === undefined
    ) {
      throw new NonRetryableQueueError(
        "Truthful follow-up calls require both quote identifiers and a negotiation.",
      );
    }

    const [currentQuote, competingQuote] = await Promise.all([
      this.client.quote.findUnique({
        include: truthfulLeverageQuoteInclude,
        where: { id: input.currentQuoteId },
      }),
      this.client.quote.findUnique({
        include: truthfulLeverageQuoteInclude,
        where: { id: input.truthfulCompetingQuoteId },
      }),
    ]);
    const [latestCurrentQuote, latestCompetingQuote] = await Promise.all([
      this.client.quote.findFirst({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
        where: { negotiationId: input.negotiationId, runId: input.runId },
      }),
      competingQuote === null || competingQuote.negotiationId === null
        ? Promise.resolve(undefined)
        : this.client.quote.findFirst({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { id: true },
            where: {
              negotiationId: competingQuote.negotiationId,
              runId: input.runId,
            },
          }),
    ]);

    return validateTruthfulLeverageQuotes({
      competingQuote:
        competingQuote === null
          ? null
          : this.truthfulLeverageQuoteInput(competingQuote),
      currentQuote:
        currentQuote === null
          ? null
          : this.truthfulLeverageQuoteInput(currentQuote),
      expectedBusinessId: input.businessId,
      expectedCurrency: input.expectedCurrency,
      expectedNegotiationId: input.negotiationId,
      expectedRunId: input.runId,
      latestCompetingQuoteId: latestCompetingQuote?.id,
      latestCurrentQuoteId: latestCurrentQuote?.id,
    });
  }

  private truthfulLeverageQuoteInput(
    quote: TruthfulLeverageQuote,
  ): TruthfulLeverageQuoteInput {
    return {
      businessId: quote.businessId,
      businessName: quote.business.name,
      createdAt: quote.createdAt,
      currency: quote.currency,
      evidence: quote.evidence,
      id: quote.id,
      negotiationBusinessId: quote.negotiation?.businessId ?? null,
      negotiationId: quote.negotiationId,
      negotiationRunId: quote.negotiation?.runId ?? null,
      negotiationStatus: quote.negotiation?.status ?? null,
      runId: quote.runId,
      status: quote.status,
      totalAmountCents: quote.totalAmountCents,
    };
  }

  private async compensateContinuationFailure(
    envelope: QueueJobEnvelope<"negotiation.continue">,
    error: unknown,
  ): Promise<void> {
    const client = this.database.client;
    const callId = deterministicId(
      "call",
      envelope.payload.negotiationId,
      envelope.idempotencyKey,
    );
    const failureMessage =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Negotiation continuation failed permanently.";
    const shouldRank = await client.$transaction(async (transaction) => {
      const call = await transaction.call.findUnique({
        where: { id: callId },
      });
      if (
        call !== null &&
        (call.providerCallId !== null ||
          (call.status !== DatabaseCallStatus.QUEUED &&
            !TERMINAL_CALL_STATUSES.has(call.status)))
      ) {
        return false;
      }
      if (call !== null && TERMINAL_CALL_STATUSES.has(call.status)) return true;
      const otherActiveCall = await transaction.call.findFirst({
        where: {
          id: { not: callId },
          negotiationId: envelope.payload.negotiationId,
          runId: envelope.payload.runId,
          status: { notIn: [...TERMINAL_CALL_STATUSES] },
        },
      });
      if (otherActiveCall !== null) return false;
      if (call !== null && call.status === DatabaseCallStatus.QUEUED) {
        await transaction.call.update({
          data: {
            endedAt: new Date(),
            failureCode: "continuation_failed",
            failureMessage,
            status: DatabaseCallStatus.FAILED,
            structuredOutcome: toJson({
              outcome: "failed",
              reason: failureMessage,
              retryable: false,
            }),
          },
          where: { id: call.id },
        });
      }
      await transaction.negotiation.updateMany({
        data: { endedAt: new Date(), status: NegotiationStatus.FAILED },
        where: {
          id: envelope.payload.negotiationId,
          runId: envelope.payload.runId,
          status: {
            notIn: [NegotiationStatus.DECLINED, NegotiationStatus.FAILED],
          },
        },
      });
      return true;
    });
    if (!shouldRank) return;
    await this.enqueueRank(
      envelope.payload.runId,
      `continuation-failed:${envelope.payload.negotiationId}`,
      envelope.traceId,
    );
    await this.appendRunEvent(
      envelope.payload.runId,
      "negotiation.continuation_failed",
      AuditActor.WORKER,
      {
        callId,
        negotiationId: envelope.payload.negotiationId,
        reason: failureMessage,
      },
      `${envelope.idempotencyKey}:terminal-failure`,
    );
  }

  private get client(): DatabaseClient {
    return this.database.client;
  }

  private parseSpecification(value: Prisma.JsonValue): JobSpecification {
    const parsed = jobSpecificationSchema.safeParse(value);
    if (!parsed.success) {
      throw new NonRetryableQueueError(
        "The confirmed job specification is invalid.",
      );
    }
    return parsed.data;
  }

  private callPlacementPayload(
    call: {
      readonly businessId: string;
      readonly id: string;
      readonly negotiation: {
        readonly metadata: Prisma.JsonValue | null;
        readonly strategy: DatabaseNegotiationStrategy;
      } | null;
    },
    run: {
      readonly id: string;
      readonly specificationVersionId: string;
    },
  ): QueueJobEnvelope<"call.place">["payload"] {
    if (call.negotiation === null) {
      throw new NonRetryableQueueError(
        "A paused call cannot resume without its negotiation strategy.",
      );
    }
    const metadata = asRecord(call.negotiation.metadata);
    const currentQuoteId = optionalString(metadata.currentQuoteId);
    const truthfulCompetingQuoteId = optionalString(
      metadata.truthfulCompetingQuoteId,
    );
    const hasTruthfulLeverage =
      currentQuoteId !== undefined && truthfulCompetingQuoteId !== undefined;

    return {
      businessId: call.businessId,
      callId: call.id,
      ...(hasTruthfulLeverage
        ? { currentQuoteId, truthfulCompetingQuoteId }
        : {}),
      runId: run.id,
      specificationVersionId: run.specificationVersionId,
      strategy: contractStrategy(call.negotiation.strategy),
    };
  }

  private providerContext(
    envelope: QueueJobEnvelope,
    context: QueueProcessingContext,
  ): ProviderRequestContext {
    return {
      deadlineAt: new Date(
        Date.now() + this.configuration.providerTimeoutMs,
      ).toISOString(),
      requestId: envelope.idempotencyKey,
      traceId: envelope.traceId,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    };
  }

  private requireProvider<Value>(
    provider: Value | undefined,
    operation: string,
  ): Value {
    if (provider === undefined) {
      throw new NonRetryableQueueError(
        `No live provider is configured for ${operation}.`,
      );
    }
    return provider;
  }

  private throwProviderFailure(failure: ProviderFailure): never {
    if (failure.retryable) throw new ProviderOperationError(failure);
    throw new NonRetryableQueueError(
      `${failure.provider} rejected the operation (${failure.code}).`,
    );
  }

  private async handleWorkflowProviderFailure(input: {
    readonly context: QueueProcessingContext;
    readonly failure: ProviderFailure;
    readonly jobId: string;
    readonly operation: string;
    readonly runId?: string;
  }): Promise<never> {
    if (
      input.failure.retryable &&
      input.context.attempt < input.context.attemptsAllowed
    ) {
      throw new ProviderOperationError(input.failure);
    }
    await this.client.job.update({
      data: { status: JobStatus.FAILED },
      where: { id: input.jobId },
    });
    if (input.runId !== undefined) {
      await this.client.negotiationRun.update({
        data: {
          completedAt: new Date(),
          failureCode: input.failure.code,
          failureMessage: `${input.operation} failed.`,
          status: NegotiationRunStatus.FAILED,
        },
        where: { id: input.runId },
      });
    }
    throw new NonRetryableQueueError(
      `${input.operation} failed (${input.failure.code}).`,
    );
  }

  private async failCallStart(
    callId: string,
    runId: string,
    failure: ProviderFailure,
    envelope: QueueJobEnvelope<"call.place">,
  ): Promise<boolean> {
    const failed = await this.client.call.updateMany({
      data: {
        endedAt: new Date(),
        failureCode:
          failure.code === "timeout" || failure.code === "unavailable"
            ? "call_start_uncertain"
            : failure.code,
        failureMessage: failure.message,
        status: DatabaseCallStatus.FAILED,
        structuredOutcome: toJson({ outcome: "failed", retryable: false }),
      },
      where: {
        id: callId,
        providerCallId: null,
        run: { status: { in: [...CALL_STARTABLE_RUN_STATUSES] } },
        runId,
        status: DatabaseCallStatus.DIALING,
      },
    });
    if (failed.count === 0) return false;
    await this.appendRunEvent(
      runId,
      "call.completed",
      AuditActor.PROVIDER,
      { callId, failureCode: failure.code, status: "failed" },
      `${envelope.idempotencyKey}:failed`,
    );
    return true;
  }

  private async restorePausedCallClaim(callId: string): Promise<boolean> {
    const restored = await this.client.call.updateMany({
      data: {
        failureCode: null,
        failureMessage: null,
        status: DatabaseCallStatus.QUEUED,
      },
      where: {
        id: callId,
        providerCallId: null,
        run: { status: NegotiationRunStatus.PAUSED },
        status: DatabaseCallStatus.DIALING,
      },
    });
    return restored.count > 0;
  }

  private async cancelRegisteredProviderCall(
    call: {
      readonly id: string;
      readonly providerCallId: string;
      readonly structuredOutcome: Prisma.JsonValue | null;
    },
    runId: string,
    provider: CallProvider,
    envelope: QueueJobEnvelope,
    context: QueueProcessingContext,
  ): Promise<void> {
    const outcome = asRecord(call.structuredOutcome);
    if (optionalString(outcome.providerCancellationCompletedAt) !== undefined)
      return;

    const result = await provider.cancelCall(
      call.providerCallId,
      this.providerContext(envelope, context),
    );
    if (!result.ok && result.error.code !== "not-found") {
      this.throwProviderFailure(result.error);
    }
    const recorded = await this.client.call.updateMany({
      data: {
        structuredOutcome: mergeJson(call.structuredOutcome, {
          providerCancellationCompletedAt: new Date().toISOString(),
        }),
      },
      where: { id: call.id, providerCallId: call.providerCallId },
    });
    if (recorded.count === 0) return;
    await this.appendRunEvent(
      runId,
      "call.updated",
      AuditActor.WORKER,
      { callId: call.id, status: "cancelled" },
      `${envelope.idempotencyKey}:provider-cancelled`,
    );
    await this.enqueueRank(runId, `cancelled:${call.id}`, envelope.traceId);
  }

  private async pauseRegisteredProviderCall(
    call: {
      readonly id: string;
      readonly providerCallId: string;
      readonly structuredOutcome: Prisma.JsonValue | null;
    },
    placement: QueueJobEnvelope<"call.place">["payload"],
    runId: string,
    provider: CallProvider,
    envelope: QueueJobEnvelope,
    context: QueueProcessingContext,
  ): Promise<void> {
    const result = await provider.cancelCall(
      call.providerCallId,
      this.providerContext(envelope, context),
    );
    if (!result.ok && result.error.code !== "not-found") {
      this.throwProviderFailure(result.error);
    }

    const cancelledAt = new Date().toISOString();
    const currentOutcome = asRecord(call.structuredOutcome);
    const priorCancellations = Array.isArray(
      currentOutcome.pausedProviderCancellations,
    )
      ? currentOutcome.pausedProviderCancellations
      : [];
    const resumableOutcome = { ...currentOutcome };
    delete resumableOutcome.providerCancellationCompletedAt;
    const reset = await this.client.call.updateMany({
      data: {
        aiDisclosureMadeAt: null,
        durationSeconds: null,
        endedAt: null,
        failureCode: null,
        failureMessage: null,
        providerCallId: null,
        recordingConsentAt: null,
        recordingStorageKey: null,
        startedAt: null,
        status: DatabaseCallStatus.QUEUED,
        structuredOutcome: toJson({
          ...resumableOutcome,
          pausedProviderCancellations: [
            ...priorCancellations,
            { cancelledAt, providerCallId: call.providerCallId },
          ],
        }),
        transcriptText: null,
      },
      where: {
        id: call.id,
        providerCallId: call.providerCallId,
        run: {
          status: {
            in: [NegotiationRunStatus.CALLING, NegotiationRunStatus.PAUSED],
          },
        },
      },
    });
    let enqueueResumedCall: boolean;
    if (reset.count > 0) {
      const resumed = await this.client.call.updateMany({
        data: { attempt: { increment: 1 } },
        where: {
          id: call.id,
          providerCallId: null,
          run: { status: NegotiationRunStatus.CALLING },
          status: DatabaseCallStatus.QUEUED,
        },
      });
      enqueueResumedCall = resumed.count > 0;
    } else {
      const current = await this.client.call.findUnique({
        include: { run: { select: { status: true } } },
        where: { id: call.id },
      });
      const cancellationHistory = Array.isArray(
        asRecord(current?.structuredOutcome).pausedProviderCancellations,
      )
        ? (asRecord(current?.structuredOutcome)
            .pausedProviderCancellations as unknown[])
        : [];
      enqueueResumedCall =
        current !== null &&
        current.providerCallId === null &&
        current.status === DatabaseCallStatus.QUEUED &&
        current.run?.status === NegotiationRunStatus.CALLING &&
        cancellationHistory.some(
          (entry) =>
            optionalString(asRecord(entry).providerCallId) ===
            call.providerCallId,
        );
    }
    if (enqueueResumedCall) {
      await this.queue.enqueue(
        createQueueJob(queueJobNames.placeCall, placement, {
          idempotencyKey: `${call.id}:resume-after-pause:${call.providerCallId}`,
          traceId: envelope.traceId,
        }),
      );
    }

    if (reset.count === 0 && !enqueueResumedCall) return;

    await this.appendRunEvent(
      runId,
      "call.updated",
      AuditActor.WORKER,
      {
        callId: call.id,
        reason: "provider_call_cancelled_while_paused",
        status: "queued",
      },
      `${envelope.idempotencyKey}:provider-paused:${call.providerCallId}`,
    );
  }

  private async enqueueOutcomePoll(
    callId: string,
    runId: string,
    providerCallId: string,
    traceId: string,
  ): Promise<void> {
    await this.queue.enqueue(
      createQueueJob(
        queueJobNames.processCallOutcome,
        { callId, providerEventId: `poll:${providerCallId}`, runId },
        {
          idempotencyKey: `${callId}:outcome-poll:${providerCallId}`,
          traceId,
        },
      ),
    );
  }

  private async reconcilePendingCallWebhooks(
    call: {
      readonly id: string;
      readonly jobId: string;
      readonly providerCallId: string;
      readonly runId: string;
    },
    provider: string,
    traceId: string,
  ): Promise<void> {
    const pendingRegistration = pendingCallRegistrationMarker(
      provider,
      call.providerCallId,
    );
    const events = await this.client.webhookEvent.findMany({
      orderBy: { receivedAt: "asc" },
      select: { id: true, providerEventId: true },
      where: {
        failureMessage: pendingRegistration,
        processedAt: null,
        provider,
      },
    });

    for (const event of events) {
      await this.queue.enqueue(
        createQueueJob(
          queueJobNames.processCallOutcome,
          {
            callId: call.id,
            providerEventId: event.providerEventId,
            runId: call.runId,
          },
          {
            idempotencyKey: `webhook:${provider}:${event.providerEventId}`,
            traceId,
          },
        ),
      );
      await this.client.webhookEvent.updateMany({
        data: {
          failureMessage: null,
          jobId: call.jobId,
          processedAt: new Date(),
        },
        where: {
          failureMessage: pendingRegistration,
          id: event.id,
          processedAt: null,
        },
      });
    }
  }

  private async enqueueRank(
    runId: string,
    trigger: string,
    traceId: string,
  ): Promise<void> {
    await this.queue.enqueue(
      createQueueJob(
        queueJobNames.rankQuotes,
        { runId },
        { idempotencyKey: `${runId}:rank:${trigger}`, traceId },
      ),
    );
  }

  private async compensateCallProcessingFailure(
    envelope: QueueJobEnvelope<"call.outcome.process">,
    error: unknown,
    context: QueueProcessingContext,
  ): Promise<void> {
    const call = await this.client.call.findUnique({
      select: {
        endedAt: true,
        id: true,
        providerCallId: true,
        run: { select: { status: true } },
        runId: true,
        status: true,
        structuredOutcome: true,
      },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.runId !== envelope.payload.runId ||
      call.status === DatabaseCallStatus.CANCELLED ||
      call.run?.status === NegotiationRunStatus.PAUSED ||
      call.run?.status === NegotiationRunStatus.CANCELLED
    ) {
      return;
    }

    const failureCode =
      error instanceof ProviderOperationError
        ? `outcome_${error.failure.code}`
        : "outcome_processing_failed";
    let cleanupFailure: ProviderFailure | undefined;
    if (
      !TERMINAL_CALL_STATUSES.has(call.status) &&
      call.providerCallId !== null &&
      this.providers.calls !== undefined
    ) {
      try {
        const cancellation = await this.providers.calls.cancelCall(
          call.providerCallId,
          this.providerContext(envelope, context),
        );
        if (!cancellation.ok && cancellation.error.code !== "not-found") {
          cleanupFailure = cancellation.error;
        }
      } catch {
        cleanupFailure = {
          code: "unavailable",
          message: "Provider cancellation failed unexpectedly.",
          provider: this.providers.calls.name,
          retryable: true,
        };
      }
    }
    if (cleanupFailure !== undefined && call.providerCallId !== null) {
      const pendingCleanup = await this.client.call.updateMany({
        data: {
          failureCode: "provider_cleanup_pending",
          failureMessage:
            "Call outcome processing is waiting for provider reconciliation.",
          structuredOutcome: mergeJson(call.structuredOutcome, {
            cleanup: "pending",
            cleanupFailureCode: cleanupFailure.code,
          }),
        },
        where: {
          id: call.id,
          providerCallId: call.providerCallId,
          run: { status: { in: [...CALL_STARTABLE_RUN_STATUSES] } },
          runId: envelope.payload.runId,
          status: call.status,
        },
      });
      if (pendingCleanup.count > 0) {
        await this.queue.enqueue(
          createQueueJob(queueJobNames.processCallOutcome, envelope.payload, {
            idempotencyKey: `${envelope.idempotencyKey}:provider-reconcile:${context.attempt}`,
            traceId: envelope.traceId,
          }),
        );
      }
      return;
    }
    const updated = await this.client.call.updateMany({
      data: {
        endedAt: call.endedAt ?? new Date(),
        failureCode,
        failureMessage: "Call outcome processing did not complete.",
        status: TERMINAL_CALL_STATUSES.has(call.status)
          ? call.status
          : DatabaseCallStatus.FAILED,
        structuredOutcome: mergeJson(call.structuredOutcome, {
          extraction: "failed",
          failureCode,
          outcome: "unavailable",
        }),
        transcriptText: null,
      },
      where: {
        id: call.id,
        providerCallId: call.providerCallId,
        run: { status: { in: [...CALL_STARTABLE_RUN_STATUSES] } },
        runId: envelope.payload.runId,
        status: call.status,
      },
    });
    if (updated.count === 0) return;

    await this.appendRunEvent(
      envelope.payload.runId,
      "call.completed",
      AuditActor.WORKER,
      { callId: call.id, failureCode, status: "failed" },
      `${envelope.idempotencyKey}:processing-failed`,
    );
    await this.enqueueRank(
      envelope.payload.runId,
      `outcome-processing-failed:${call.id}`,
      envelope.traceId,
    );
  }

  private async compensateQuoteProcessingFailure(
    envelope: QueueJobEnvelope<"quote.normalize">,
    error: unknown,
  ): Promise<void> {
    const call = await this.client.call.findUnique({
      select: {
        id: true,
        runId: true,
        status: true,
        structuredOutcome: true,
      },
      where: { id: envelope.payload.callId },
    });
    if (
      call === null ||
      call.runId !== envelope.payload.runId ||
      call.status === DatabaseCallStatus.CANCELLED
    ) {
      return;
    }

    const currentOutcome = asRecord(call.structuredOutcome);
    if (currentOutcome.extraction === "failed") {
      await this.client.call.update({
        data: { transcriptText: null },
        where: { id: call.id },
      });
      return;
    }
    const failureCode =
      error instanceof ProviderOperationError
        ? `extraction_${error.failure.code}`
        : "quote_processing_failed";
    await this.client.call.update({
      data: {
        failureCode,
        failureMessage: "Quote evidence processing did not complete.",
        structuredOutcome: mergeJson(call.structuredOutcome, {
          extraction: "failed",
          extractionFailureCode: failureCode,
          outcome: optionalString(currentOutcome.outcome) ?? "unavailable",
        }),
        transcriptText: null,
      },
      where: { id: call.id },
    });
    await this.enqueueRank(
      envelope.payload.runId,
      `quote-processing-failed:${call.id}`,
      envelope.traceId,
    );
  }

  private async releaseOutcomeClaim(
    callId: string,
    marker?: string,
  ): Promise<void> {
    try {
      await this.client.call.updateMany({
        data: { failureCode: null },
        where: {
          id: callId,
          failureCode:
            marker === undefined
              ? { startsWith: "OUTCOME_PROCESSING:" }
              : marker,
        },
      });
    } catch {
      // Preserve the provider/storage error that triggered the retry.
    }
  }

  private async persistEvidence(
    input: {
      readonly body: Uint8Array;
      readonly callId: string;
      readonly contentType: StoreEvidenceRequest["contentType"];
      readonly jobId: string;
      readonly key: string;
      readonly kind: EvidenceKind;
      readonly metadata: Readonly<Record<string, string>>;
      readonly quoteId?: string;
      readonly retentionUntil: Date;
      readonly runId: string;
    },
    envelope: QueueJobEnvelope,
    context: QueueProcessingContext,
  ): Promise<void> {
    const existing = await this.client.evidence.findFirst({
      where: { callId: input.callId, kind: input.kind, storageKey: input.key },
    });
    if (existing !== null) return;
    const storage = this.requireProvider(
      this.providers.storage,
      "evidence storage",
    );
    let stored: ProviderResult<StoredEvidence>;
    try {
      stored = await storage.put(
        {
          body: input.body,
          contentType: input.contentType,
          key: input.key,
          metadata: input.metadata,
          retentionUntil: input.retentionUntil.toISOString(),
        },
        this.providerContext(envelope, context),
      );
    } catch (error) {
      await this.releaseOutcomeClaim(input.callId);
      throw error;
    }
    if (!stored.ok && stored.error.code !== "conflict") {
      await this.releaseOutcomeClaim(input.callId);
      this.throwProviderFailure(stored.error);
    }
    const checksum = createHash("sha256").update(input.body).digest("hex");
    try {
      await this.client.evidence.create({
        data: {
          callId: input.callId,
          checksum,
          contentLength: input.body.byteLength,
          contentType: input.contentType,
          jobId: input.jobId,
          kind: input.kind,
          metadata: toJson(input.metadata),
          provider: storage.name,
          quoteId: input.quoteId ?? null,
          retentionUntil: input.retentionUntil,
          runId: input.runId,
          storageKey: input.key,
        },
      });
    } catch (error) {
      await this.releaseOutcomeClaim(input.callId);
      throw error;
    }
  }

  private async appendRunEvent(
    runId: string,
    eventType: string,
    actor: AuditActor,
    payload: Readonly<Record<string, unknown>>,
    idempotencyKey: string,
  ): Promise<void> {
    const eventId = deterministicId("event", runId, idempotencyKey);
    await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`,
      );
      const duplicate = await transaction.runEvent.findUnique({
        where: { id: eventId },
      });
      if (duplicate !== null) return;
      const [lastEvent, run] = await Promise.all([
        transaction.runEvent.findFirst({
          orderBy: { sequence: "desc" },
          where: { runId },
        }),
        transaction.negotiationRun.findUnique({
          select: { correlationId: true },
          where: { id: runId },
        }),
      ]);
      if (run === null) {
        throw new NonRetryableQueueError(
          "The run event target does not exist.",
        );
      }
      await transaction.runEvent.create({
        data: {
          actor,
          correlationId: run.correlationId,
          eventType,
          id: eventId,
          occurredAt: new Date(),
          payload: toJson(payload),
          runId,
          sequence: (lastEvent?.sequence ?? 0) + 1,
        },
      });
    });
  }
}

function jsonMoney(
  value: unknown,
  expectedCurrency: string,
): { readonly amountMinor: number; readonly currency: string } | undefined {
  const candidate = asRecord(value);
  return typeof candidate.amountMinor === "number" &&
    Number.isSafeInteger(candidate.amountMinor) &&
    candidate.amountMinor >= 0 &&
    candidate.currency === expectedCurrency
    ? { amountMinor: candidate.amountMinor, currency: expectedCurrency }
    : undefined;
}

function rankingQuoteContract(record: RankingQuote): Quote | undefined {
  const storedTerms = asRecord(record.terms);
  const evidence = record.evidence.find(
    (item) => item.kind === EvidenceKind.TRANSCRIPT,
  );
  const cancellationPolicy = optionalString(storedTerms.cancellationPolicy);
  const additionalNotes = Array.isArray(storedTerms.additionalNotes)
    ? storedTerms.additionalNotes.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : [];
  const contractTerms = {
    ...(record.depositAmountCents === null
      ? {}
      : {
          deposit: {
            amountMinor: record.depositAmountCents,
            currency: record.currency,
          },
        }),
    ...(cancellationPolicy === undefined ? {} : { cancellationPolicy }),
    ...(typeof storedTerms.insuranceIncluded === "boolean"
      ? { insuranceIncluded: storedTerms.insuranceIncluded }
      : {}),
    ...(typeof storedTerms.packingIncluded === "boolean"
      ? { packingIncluded: storedTerms.packingIncluded }
      : {}),
    ...(additionalNotes.length === 0 ? {} : { additionalNotes }),
  };
  const basePrice = jsonMoney(storedTerms.basePrice, record.currency);
  const hourlyRate = jsonMoney(storedTerms.hourlyRate, record.currency);
  const tax = jsonMoney(storedTerms.tax, record.currency);
  const minimumHours =
    typeof storedTerms.minimumHours === "number" &&
    Number.isFinite(storedTerms.minimumHours) &&
    storedTerms.minimumHours >= 0
      ? storedTerms.minimumHours
      : undefined;
  const candidate = {
    id: record.id,
    jobId: record.jobId,
    businessId: record.businessId,
    status: record.status.toLowerCase(),
    pricingModel: record.pricingModel.toLowerCase(),
    estimateType:
      record.estimateType === null
        ? undefined
        : record.estimateType.toLowerCase(),
    totalPrice: {
      amountMinor: record.totalAmountCents,
      currency: record.currency,
    },
    fees: record.items.map((item) => ({
      amount:
        item.totalAmountCents === null
          ? null
          : { amountMinor: item.totalAmountCents, currency: record.currency },
      category: item.category,
      code: item.feeCode ?? `line-${item.lineNumber}`,
      disclosed: item.disclosed,
      includedInTotal: item.includedInTotal,
      label: item.label,
      required: item.required,
    })),
    confidence: record.confidence === null ? 0 : Number(record.confidence),
    completeness:
      record.completeness === null ? undefined : Number(record.completeness),
    capturedAt: record.createdAt.toISOString(),
    ...(record.minimumAmountCents === null || record.maximumAmountCents === null
      ? {}
      : {
          priceRange: {
            minimum: {
              amountMinor: record.minimumAmountCents,
              currency: record.currency,
            },
            maximum: {
              amountMinor: record.maximumAmountCents,
              currency: record.currency,
            },
          },
        }),
    ...(record.estimatedHours === null
      ? {}
      : { estimatedHours: Number(record.estimatedHours) }),
    ...(minimumHours === undefined ? {} : { minimumHours }),
    ...(basePrice === undefined ? {} : { basePrice }),
    ...(hourlyRate === undefined ? {} : { hourlyRate }),
    ...(tax === undefined ? {} : { tax }),
    ...(record.negotiatedSavingCents === null ||
    record.negotiatedSavingCents <= 0
      ? {}
      : {
          discount: {
            amountMinor: record.negotiatedSavingCents,
            currency: record.currency,
          },
        }),
    ...(record.validUntil === null
      ? {}
      : { validUntil: record.validUntil.toISOString() }),
    ...(evidence === undefined
      ? {}
      : {
          evidence: {
            callId: record.callId ?? undefined,
            source: "phone_call",
            transcriptKey: evidence.storageKey,
          },
        }),
    ...(Object.keys(contractTerms).length === 0
      ? {}
      : { terms: contractTerms }),
  };
  const parsed = quoteSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
