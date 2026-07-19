import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  businessSchema,
  jobSpecificationSchema,
  quoteSchema,
  type Business,
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
import type {
  ProviderFailure,
  ProviderRequestContext,
  ProviderResult,
  StoreEvidenceRequest,
  StoredEvidence,
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

const rankingRunInclude = {
  calls: true,
  job: true,
  quotes: {
    include: { business: true, evidence: true, items: true },
    orderBy: { createdAt: "asc" },
  },
  recommendation: true,
  specificationVersion: true,
} satisfies Prisma.NegotiationRunInclude;

type RankingRun = Prisma.NegotiationRunGetPayload<{
  include: typeof rankingRunInclude;
}>;
type RankingQuote = RankingRun["quotes"][number];

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
    if (TERMINAL_RUN_STATUSES.has(call.run.status)) return;
    if (call.run.status === NegotiationRunStatus.PAUSED) return;
    if (
      call.run.callingConsentAt === null ||
      call.run.aiDisclosureAcknowledgedAt === null ||
      call.run.recordingConsentAt === null
    ) {
      throw new NonRetryableQueueError(
        "Calling, recording, and AI disclosure consent are required before a provider call.",
      );
    }
    if (call.providerCallId !== null) {
      if (!TERMINAL_CALL_STATUSES.has(call.status)) {
        await this.enqueueOutcomePoll(
          call.id,
          call.run.id,
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
        await this.failCallStart(call.id, call.run.id, failure, envelope);
        await this.enqueueRank(
          call.run.id,
          `call-start-uncertain:${call.id}`,
          envelope.traceId,
        );
      }
      throw new NonRetryableQueueError(
        "An unregistered provider call cannot be started more than once.",
      );
    }

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
        status: DatabaseCallStatus.QUEUED,
      },
    });
    if (claimed.count === 0) return;

    const specification = this.parseSpecification(
      call.run.specificationVersion.specification,
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
            "This AI-assisted call may be recorded for quote evidence.",
        },
        job: specification,
        locale: call.locale,
        strategy: envelope.payload.strategy,
      },
      this.providerContext(envelope, context),
    );
    if (!started.ok) {
      const safeToRetry =
        started.error.retryable && started.error.code === "rate-limited";
      if (safeToRetry && context.attempt < context.attemptsAllowed) {
        await client.call.update({
          data: {
            failureCode: started.error.code,
            failureMessage: started.error.message,
            status: DatabaseCallStatus.QUEUED,
          },
          where: { id: call.id },
        });
        throw new ProviderOperationError(started.error);
      }
      await this.failCallStart(call.id, call.run.id, started.error, envelope);
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
    await client.$transaction([
      client.call.update({
        data: {
          aiDisclosureMadeAt: submittedAt,
          providerCallId: started.value.providerCallId,
          recordingConsentAt: call.run.recordingConsentAt,
          startedAt: submittedAt,
          status: DatabaseCallStatus.DIALING,
        },
        where: { id: call.id },
      }),
      client.negotiationRun.updateMany({
        data: {
          startedAt: call.run.startedAt ?? submittedAt,
          status: NegotiationRunStatus.CALLING,
        },
        where: {
          id: call.run.id,
          status: { notIn: [...TERMINAL_RUN_STATUSES] },
        },
      }),
      client.job.update({
        data: { status: JobStatus.CALLING },
        where: { id: call.jobId },
      }),
    ]);
    await this.appendRunEvent(
      call.run.id,
      "call.started",
      AuditActor.PROVIDER,
      { businessId: call.businessId, callId: call.id, provider: provider.name },
      `${envelope.idempotencyKey}:started`,
    );
    await this.enqueueOutcomePoll(
      call.id,
      call.run.id,
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
      where: { id: envelope.payload.callId },
    });
    if (call === null || call.runId !== envelope.payload.runId) {
      throw new NonRetryableQueueError(
        "The cancellation job does not match its call run.",
      );
    }
    if (call.status !== DatabaseCallStatus.CANCELLED) {
      throw new NonRetryableQueueError(
        "A provider call can be cancelled only after Relay records the cancellation.",
      );
    }
    const outcome = asRecord(call.structuredOutcome);
    if (optionalString(outcome.providerCancellationCompletedAt) !== undefined)
      return;
    if (call.providerCallId === null) return;

    const result = await provider.cancelCall(
      call.providerCallId,
      this.providerContext(envelope, context),
    );
    if (!result.ok && result.error.code !== "not-found") {
      this.throwProviderFailure(result.error);
    }
    await client.call.update({
      data: {
        structuredOutcome: mergeJson(call.structuredOutcome, {
          providerCancellationCompletedAt: new Date().toISOString(),
        }),
      },
      where: { id: call.id },
    });
    await this.appendRunEvent(
      envelope.payload.runId,
      "call.updated",
      AuditActor.WORKER,
      { callId: call.id, status: "cancelled" },
      `${envelope.idempotencyKey}:provider-cancelled`,
    );
    await this.enqueueRank(
      call.runId,
      `cancelled:${call.id}`,
      envelope.traceId,
    );
  }

  async processCallOutcome(
    envelope: QueueJobEnvelope<"call.outcome.process">,
    context: QueueProcessingContext,
  ): Promise<void> {
    const provider = this.requireProvider(this.providers.calls, "call status");
    const client = this.database.client;
    let call = await client.call.findUnique({
      include: { job: { include: { user: true } }, run: true },
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
      throw new NonRetryableQueueError(
        "The call has no registered provider identifier.",
      );
    }
    const run = call.run;
    const providerCallId = call.providerCallId;

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

    if (transcriptKey === undefined) {
      await client.call.update({
        data: {
          failureCode: null,
          structuredOutcome: mergeJson(call.structuredOutcome, {
            extraction: "skipped",
            outcome: "completed_without_quote_evidence",
            ...(recordingFailure === undefined
              ? {}
              : { recordingFailureCode: recordingFailure.code }),
          }),
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
    const extraction = this.requireProvider(
      this.providers.extraction,
      "quote extraction",
    );
    const client = this.database.client;
    const existing = await client.quote.findUnique({
      where: { id: envelope.payload.quoteId },
    });
    if (existing !== null) {
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
    if (run.status === NegotiationRunStatus.CANCELLED) return;

    const candidates = run.quotes.flatMap((record) => {
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
        : run.quotes.find((quote) => quote.id === bestRanking.quoteId);
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
    await client.$transaction([
      client.negotiationRun.update({
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
        where: { id: run.id },
      }),
      client.job.update({
        data: {
          completedAt,
          status:
            terminalStatus === NegotiationRunStatus.FAILED
              ? JobStatus.FAILED
              : JobStatus.COMPLETED,
        },
        where: { id: run.jobId },
      }),
    ]);
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
    _context: QueueProcessingContext,
  ): Promise<void> {
    void _context;
    const provider = this.requireProvider(
      this.providers.calls,
      "negotiation continuation",
    );
    const client = this.database.client;
    const negotiation = await client.negotiation.findUnique({
      include: { calls: { orderBy: { createdAt: "desc" } }, run: true },
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
    if (
      TERMINAL_RUN_STATUSES.has(negotiation.run.status) ||
      negotiation.run.status === NegotiationRunStatus.PAUSED
    ) {
      return;
    }

    if (envelope.payload.currentQuoteId !== undefined) {
      const currentQuote = await client.quote.findFirst({
        include: { evidence: true },
        where: {
          id: envelope.payload.currentQuoteId,
          negotiationId: negotiation.id,
          runId: negotiation.run.id,
        },
      });
      if (currentQuote === null || currentQuote.evidence.length === 0) {
        throw new NonRetryableQueueError(
          "The current quote is not an evidenced quote from this negotiation.",
        );
      }
    }
    if (envelope.payload.truthfulCompetingQuoteId !== undefined) {
      const competingQuote = await client.quote.findFirst({
        include: { evidence: true },
        where: {
          id: envelope.payload.truthfulCompetingQuoteId,
          runId: negotiation.run.id,
          status: { not: QuoteStatus.WITHDRAWN },
        },
      });
      if (competingQuote === null || competingQuote.evidence.length === 0) {
        throw new NonRetryableQueueError(
          "Negotiation leverage must reference a real, evidenced quote from this run.",
        );
      }
      if (competingQuote.businessId === negotiation.businessId) {
        throw new NonRetryableQueueError(
          "Competing leverage must come from a different business.",
        );
      }
    }

    const activeCall = negotiation.calls.find(
      (call) => !TERMINAL_CALL_STATUSES.has(call.status),
    );
    if (activeCall !== undefined) return;
    const callId = deterministicId(
      "call",
      negotiation.id,
      envelope.idempotencyKey,
    );
    const existingCall = await client.call.findUnique({
      where: { id: callId },
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
            aiDisclosureMadeAt: negotiation.run.aiDisclosureAcknowledgedAt,
            businessId: negotiation.businessId,
            id: callId,
            jobId: negotiation.jobId,
            negotiationId: negotiation.id,
            provider: provider.name,
            recordingConsentAt: negotiation.run.recordingConsentAt,
            runId: negotiation.run.id,
            status: DatabaseCallStatus.QUEUED,
          },
        }),
      ]);
    }
    await this.appendRunEvent(
      negotiation.run.id,
      "call.queued",
      AuditActor.WORKER,
      { businessId: negotiation.businessId, callId, round: nextRound },
      `${envelope.idempotencyKey}:call:${callId}`,
    );
    await this.queue.enqueue(
      createQueueJob(
        queueJobNames.placeCall,
        {
          businessId: negotiation.businessId,
          callId,
          runId: negotiation.run.id,
          specificationVersionId: negotiation.run.specificationVersionId,
          strategy: contractStrategy(negotiation.strategy),
        },
        {
          idempotencyKey: `${callId}:place`,
          traceId: envelope.traceId,
        },
      ),
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
  ): Promise<void> {
    await this.client.call.update({
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
      where: { id: callId },
    });
    await this.appendRunEvent(
      runId,
      "call.completed",
      AuditActor.PROVIDER,
      { callId, failureCode: failure.code, status: "failed" },
      `${envelope.idempotencyKey}:failed`,
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
        { idempotencyKey: `${callId}:outcome-poll`, traceId },
      ),
    );
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
