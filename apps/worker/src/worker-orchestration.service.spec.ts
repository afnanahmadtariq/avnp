import type { DatabaseClient } from "@relay/database";
import {
  CallStatus as DatabaseCallStatus,
  EvidenceKind,
  NegotiationStatus,
  NegotiationRunStatus,
  PricingModel,
  QuoteEstimateType,
  QuoteStatus,
} from "@relay/database";
import type { CallProvider, ProviderResult } from "@relay/integrations";
import {
  createQueueJob,
  queueJobNames,
  queueNames,
  type QueueProcessingContext,
} from "@relay/queue";
import { loadRuntimeConfig } from "@relay/runtime-config";
import { describe, expect, it, vi } from "vitest";

import {
  classifyNonQuoteOutcome,
  selectEvidenceBackedContinuations,
  WorkerOrchestrationService,
} from "./worker-orchestration.service.js";
import { createWorkerProviderSet } from "./worker-providers.js";
import type { WorkerDatabaseService } from "./worker-database.service.js";
import type { WorkerQueueProducerService } from "./worker-queue-producer.service.js";

describe("worker provider composition", () => {
  it("keeps fixture startup credential-free and outbound-provider-free", () => {
    const configuration = loadRuntimeConfig({
      NODE_ENV: "test",
      RELAY_MODE: "fixture",
    });

    expect(createWorkerProviderSet(configuration)).toEqual({});
  });
});

describe("WorkerOrchestrationService", () => {
  it("classifies evidenced non-quote outcomes without inventing a price", () => {
    expect(
      classifyNonQuoteOutcome(
        undefined,
        "Business: Please call us back tomorrow morning.",
      ),
    ).toBe("callback_requested");
    expect(
      classifyNonQuoteOutcome(
        undefined,
        "Business: We cannot quote or take this move.",
      ),
    ).toBe("declined");
    expect(classifyNonQuoteOutcome(undefined, null)).toBe("no_answer");
    expect(
      classifyNonQuoteOutcome(
        undefined,
        "Business: The guaranteed total is $1,840.",
      ),
    ).toBeUndefined();
  });

  it("selects only one lower, transcript-backed quote for the first follow-up round", () => {
    const createdAt = new Date("2026-07-19T10:00:00.000Z");
    const negotiations = [
      negotiationCandidate("negotiation-high", "business-high"),
      negotiationCandidate("negotiation-low", "business-low"),
      negotiationCandidate("negotiation-finished", "business-finished", 1),
    ];
    const quotes = [
      continuationQuote(
        "quote-high",
        "negotiation-high",
        "business-high",
        220_000,
        createdAt,
      ),
      continuationQuote(
        "quote-low",
        "negotiation-low",
        "business-low",
        180_000,
        createdAt,
      ),
      continuationQuote(
        "quote-finished",
        "negotiation-finished",
        "business-finished",
        240_000,
        createdAt,
      ),
    ];

    expect(
      selectEvidenceBackedContinuations({
        eligibleQuoteIds: new Set(quotes.map((quote) => quote.id)),
        expectedCurrency: "USD",
        negotiations,
        quotes,
      }),
    ).toEqual([
      {
        currentQuoteId: "quote-high",
        negotiationId: "negotiation-high",
        truthfulCompetingQuoteId: "quote-low",
      },
    ]);
  });

  it("does not fall back to stale or non-transcript quote leverage", () => {
    const firstCapturedAt = new Date("2026-07-19T10:00:00.000Z");
    const laterCapturedAt = new Date("2026-07-19T10:05:00.000Z");
    const negotiations = [
      negotiationCandidate("negotiation-high", "business-high"),
      negotiationCandidate("negotiation-low", "business-low"),
    ];
    const staleLowerQuote = continuationQuote(
      "quote-low-stale",
      "negotiation-low",
      "business-low",
      180_000,
      firstCapturedAt,
    );
    const withdrawnLatestQuote = {
      ...continuationQuote(
        "quote-low-withdrawn",
        "negotiation-low",
        "business-low",
        170_000,
        laterCapturedAt,
      ),
      status: QuoteStatus.WITHDRAWN,
    };
    const noTranscriptQuote = {
      ...continuationQuote(
        "quote-no-transcript",
        "negotiation-low",
        "business-low",
        160_000,
        laterCapturedAt,
      ),
      evidence: [{ kind: EvidenceKind.STRUCTURED_EXTRACTION }],
    };
    const highQuote = continuationQuote(
      "quote-high",
      "negotiation-high",
      "business-high",
      220_000,
      firstCapturedAt,
    );

    expect(
      selectEvidenceBackedContinuations({
        eligibleQuoteIds: new Set([
          highQuote.id,
          staleLowerQuote.id,
          withdrawnLatestQuote.id,
        ]),
        expectedCurrency: "USD",
        negotiations,
        quotes: [highQuote, staleLowerQuote, withdrawnLatestQuote],
      }),
    ).toEqual([]);
    expect(
      selectEvidenceBackedContinuations({
        eligibleQuoteIds: new Set([highQuote.id, noTranscriptQuote.id]),
        expectedCurrency: "USD",
        negotiations,
        quotes: [highQuote, noTranscriptQuote],
      }),
    ).toEqual([]);
  });

  it("keeps a run active and schedules the same truthful follow-up idempotently", async () => {
    const enqueue = vi.fn(async (envelope: unknown) => {
      void envelope;
      return {
        jobId: "continue-job",
        queueName: queueNames.negotiationOrchestration,
      };
    });
    const transaction = vi.fn();
    const run = rankingRunFixture();
    const client = {
      $transaction: transaction,
      negotiationRun: { findUnique: vi.fn(async () => run) },
      quote: { update: vi.fn(async () => ({ id: "quote" })) },
      recommendation: { upsert: vi.fn(async () => ({ id: "recommendation" })) },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider(),
      client,
      enqueue,
    });
    const envelope = createQueueJob(
      queueJobNames.rankQuotes,
      { runId: "run-1" },
      { idempotencyKey: "run-1:rank", traceId: "trace-1" },
    );

    await orchestrator.rankRunQuotes(envelope, processingContext());
    await orchestrator.rankRunQuotes(envelope, processingContext());

    expect(transaction).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(2);
    const firstEnvelope = enqueue.mock.calls[0]?.[0];
    const secondEnvelope = enqueue.mock.calls[1]?.[0];
    expect(firstEnvelope).toEqual(
      expect.objectContaining({
        idempotencyKey:
          "run-1:continue:negotiation-high:round:1:quote-high:quote-low",
        name: queueJobNames.continueNegotiation,
        payload: {
          currentQuoteId: "quote-high",
          negotiationId: "negotiation-high",
          runId: "run-1",
          truthfulCompetingQuoteId: "quote-low",
        },
      }),
    );
    expect(secondEnvelope).toEqual(firstEnvelope);
  });

  it("cancels an already-authorized live provider call once and records completion", async () => {
    const cancelCall = vi.fn(async (): Promise<ProviderResult<void>> => ({
      ok: true,
      value: undefined,
    }));
    const update = vi.fn(async () => ({ id: "call-1" }));
    const createEvent = vi.fn(async () => ({ id: "event-1" }));
    const enqueue = vi.fn(async () => ({
      jobId: "rank-job",
      queueName: queueNames.quoteAnalysis,
    }));
    const transactionClient = eventTransactionClient(createEvent);
    const client = {
      $transaction: vi.fn(async (operation: unknown) => {
        if (typeof operation !== "function")
          throw new Error("Unexpected transaction");
        return (operation as (value: unknown) => Promise<unknown>)(
          transactionClient,
        );
      }),
      call: {
        findUnique: vi.fn(async () => ({
          id: "call-1",
          providerCallId: "conversation-1",
          runId: "run-1",
          status: DatabaseCallStatus.CANCELLED,
          structuredOutcome: null,
        })),
        update,
      },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider({ cancelCall }),
      client,
      enqueue,
    });
    const envelope = createQueueJob(
      queueJobNames.cancelCall,
      { callId: "call-1", runId: "run-1" },
      { idempotencyKey: "call-1:cancel", traceId: "trace-1" },
    );

    await orchestrator.cancelCall(envelope, processingContext());

    expect(cancelCall).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          structuredOutcome: expect.objectContaining({
            providerCancellationCompletedAt: expect.any(String),
          }),
        }),
      }),
    );
    expect(createEvent).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: queueJobNames.rankQuotes }),
    );
  });

  it("does not place a second billable call when a provider id is already registered", async () => {
    const startCall = vi.fn();
    const enqueue = vi.fn(async () => ({
      jobId: "outcome-job",
      queueName: queueNames.callExecution,
    }));
    const client = {
      call: {
        findUnique: vi.fn(async () => ({
          businessId: "business-1",
          id: "call-1",
          providerCallId: "conversation-1",
          run: {
            id: "run-1",
            specificationVersionId: "version-1",
            status: NegotiationRunStatus.CALLING,
          },
          runId: "run-1",
          status: DatabaseCallStatus.DIALING,
        })),
      },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider({ startCall }),
      client,
      enqueue,
    });
    const envelope = createQueueJob(
      queueJobNames.placeCall,
      {
        businessId: "business-1",
        callId: "call-1",
        runId: "run-1",
        specificationVersionId: "version-1",
        strategy: "fee_removal",
      },
      { idempotencyKey: "call-1:place", traceId: "trace-1" },
    );

    await orchestrator.placeCall(envelope, processingContext());

    expect(startCall).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: queueJobNames.processCallOutcome,
        payload: expect.objectContaining({ callId: "call-1" }),
      }),
    );
  });

  it("rejects competing-quote leverage that has no persisted evidence", async () => {
    const enqueue = vi.fn();
    const client = {
      negotiation: {
        findUnique: vi.fn(async () => ({
          calls: [],
          id: "negotiation-1",
          run: { id: "run-1", status: NegotiationRunStatus.CALLING },
          runId: "run-1",
        })),
      },
      quote: {
        findFirst: vi.fn(async () => ({ evidence: [], id: "quote-2" })),
      },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider(),
      client,
      enqueue,
    });
    const envelope = createQueueJob(
      queueJobNames.continueNegotiation,
      {
        negotiationId: "negotiation-1",
        runId: "run-1",
        truthfulCompetingQuoteId: "quote-2",
      },
      { idempotencyKey: "negotiation-1:continue", traceId: "trace-1" },
    );

    await expect(
      orchestrator.continueNegotiation(envelope, processingContext()),
    ).rejects.toThrow(/real, evidenced quote/);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

function createOrchestrator(input: {
  readonly callProvider: CallProvider;
  readonly client: DatabaseClient;
  readonly enqueue: ReturnType<typeof vi.fn>;
}): WorkerOrchestrationService {
  const configuration = loadRuntimeConfig({
    API_PUBLIC_URL: "https://relay.example",
    NODE_ENV: "test",
    RELAY_MODE: "fixture",
  });
  const database = { client: input.client } as WorkerDatabaseService;
  const queue = {
    enabled: true,
    enqueue: input.enqueue,
  } as unknown as WorkerQueueProducerService;
  return new WorkerOrchestrationService(
    database,
    { calls: input.callProvider },
    queue,
    configuration,
  );
}

function fakeCallProvider(overrides: Partial<CallProvider> = {}): CallProvider {
  return {
    cancelCall: vi.fn(async () => ({ ok: true, value: undefined })),
    getCall: vi.fn(),
    getRecording: vi.fn(),
    name: "fake-calls",
    startCall: vi.fn(),
    verifyWebhook: vi.fn(),
    ...overrides,
  } as CallProvider;
}

function eventTransactionClient(createEvent: ReturnType<typeof vi.fn>) {
  return {
    $queryRaw: vi.fn(async () => [{ locked: true }]),
    negotiationRun: {
      findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
    },
    runEvent: {
      create: createEvent,
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
    },
  };
}

function processingContext(): QueueProcessingContext {
  return {
    attempt: 1,
    attemptsAllowed: 5,
    bullJobId: "bull-job-1",
    queueName: queueNames.callExecution,
    updateProgress: async () => undefined,
  };
}

function negotiationCandidate(
  id: string,
  businessId: string,
  currentRound = 0,
) {
  return {
    businessId,
    currentRound,
    id,
    status: NegotiationStatus.UNCHANGED,
  };
}

function continuationQuote(
  id: string,
  negotiationId: string,
  businessId: string,
  totalAmountCents: number,
  createdAt: Date,
) {
  return {
    businessId,
    createdAt,
    currency: "USD",
    evidence: [{ kind: EvidenceKind.TRANSCRIPT }],
    id,
    negotiationId,
    status: QuoteStatus.FINAL,
    totalAmountCents,
  };
}

function rankingRunFixture() {
  const createdAt = new Date("2026-07-19T10:00:00.000Z");
  return {
    calls: [
      {
        id: "call-high",
        status: DatabaseCallStatus.COMPLETED,
        structuredOutcome: { extraction: "completed" },
      },
      {
        id: "call-low",
        status: DatabaseCallStatus.COMPLETED,
        structuredOutcome: { extraction: "completed" },
      },
    ],
    configurationVersion: "moving-v1",
    id: "run-1",
    job: { currency: "USD" },
    jobId: "job-1",
    negotiations: [
      negotiationCandidate("negotiation-high", "business-high"),
      negotiationCandidate("negotiation-low", "business-low"),
    ],
    quotes: [
      rankingQuoteFixture({
        amount: 220_000,
        businessId: "business-high",
        callId: "call-high",
        createdAt,
        id: "quote-high",
        negotiationId: "negotiation-high",
      }),
      rankingQuoteFixture({
        amount: 180_000,
        businessId: "business-low",
        callId: "call-low",
        createdAt,
        id: "quote-low",
        negotiationId: "negotiation-low",
      }),
    ],
    recommendation: null,
    specificationVersion: { id: "version-1" },
    status: NegotiationRunStatus.CALLING,
  };
}

function rankingQuoteFixture(input: {
  readonly amount: number;
  readonly businessId: string;
  readonly callId: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly negotiationId: string;
}) {
  return {
    business: {
      name: input.businessId,
      rating: 4.8,
      reviewCount: 100,
    },
    businessId: input.businessId,
    callId: input.callId,
    completeness: 1,
    confidence: 0.98,
    createdAt: input.createdAt,
    currency: "USD",
    depositAmountCents: null,
    estimatedHours: null,
    estimateType: QuoteEstimateType.BINDING,
    evidence: [
      {
        kind: EvidenceKind.TRANSCRIPT,
        storageKey: `runs/run-1/${input.callId}/transcript.txt`,
      },
    ],
    id: input.id,
    items: [],
    jobId: "job-1",
    maximumAmountCents: null,
    minimumAmountCents: null,
    negotiatedSavingCents: 0,
    negotiationId: input.negotiationId,
    pricingModel: PricingModel.FIXED,
    status: QuoteStatus.FINAL,
    terms: {},
    totalAmountCents: input.amount,
    validUntil: null,
  };
}
