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
import type {
  CallProvider,
  ProviderResult,
  StructuredExtractionProvider,
} from "@relay/integrations";
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
  selectLatestActiveQuoteIds,
  validateTruthfulLeverageQuotes,
  WorkerOrchestrationService,
} from "./worker-orchestration.service.js";
import {
  createWorkerProviderSet,
  type WorkerProviderSet,
} from "./worker-providers.js";
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
    expect(
      classifyNonQuoteOutcome(
        "callback_requested",
        "Business: The total is $1,840, but please call back tomorrow.",
      ),
    ).toBeUndefined();
    expect(
      classifyNonQuoteOutcome(
        "declined",
        "Business: Our quote is 1840 dollars, though we cannot talk longer.",
      ),
    ).toBeUndefined();
  });

  it("keeps only the newest active quote for each business", () => {
    const earlier = new Date("2026-07-19T10:00:00.000Z");
    const later = new Date("2026-07-19T10:05:00.000Z");

    expect(
      selectLatestActiveQuoteIds([
        {
          businessId: "business-1",
          createdAt: earlier,
          id: "quote-old",
          status: QuoteStatus.FINAL,
        },
        {
          businessId: "business-1",
          createdAt: later,
          id: "quote-new",
          status: QuoteStatus.NEGOTIATED,
        },
        {
          businessId: "business-2",
          createdAt: later,
          id: "quote-withdrawn",
          status: QuoteStatus.WITHDRAWN,
        },
      ]),
    ).toEqual(new Set(["quote-new"]));
  });

  it("accepts only latest lower same-currency transcript leverage", () => {
    const current = leverageQuote({
      amount: 221_000,
      businessId: "business-current",
      businessName: "Pine & Co.",
      id: "quote-current",
      negotiationId: "negotiation-current",
      negotiationStatus: NegotiationStatus.IN_PROGRESS,
    });
    const competing = leverageQuote({
      amount: 184_000,
      businessId: "business-competing",
      businessName: "Carolina Transit",
      id: "quote-competing",
      negotiationId: "negotiation-competing",
      negotiationStatus: NegotiationStatus.UNCHANGED,
    });
    const input = {
      competingQuote: competing,
      currentQuote: current,
      expectedBusinessId: "business-current",
      expectedCurrency: "USD",
      expectedNegotiationId: "negotiation-current",
      expectedRunId: "run-1",
      latestCompetingQuoteId: competing.id,
      latestCurrentQuoteId: current.id,
    };

    expect(validateTruthfulLeverageQuotes(input)).toEqual({
      competingBusinessName: "Carolina Transit",
      competingQuoteAmountMinor: 184_000,
      competingQuoteId: "quote-competing",
      currency: "USD",
      currentQuoteAmountMinor: 221_000,
      currentQuoteId: "quote-current",
    });
    expect(() =>
      validateTruthfulLeverageQuotes({
        ...input,
        latestCompetingQuoteId: "quote-newer",
      }),
    ).toThrow(/latest active, transcript-evidenced/);
    expect(() =>
      validateTruthfulLeverageQuotes({
        ...input,
        competingQuote: { ...competing, currency: "EUR" },
      }),
    ).toThrow(/same-currency/);
    expect(() =>
      validateTruthfulLeverageQuotes({
        ...input,
        competingQuote: { ...competing, totalAmountCents: 230_000 },
      }),
    ).toThrow(/lower competing offer/);
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
    const expectedFollowUp = {
      idempotencyKey:
        "run-1:continue:negotiation-high:round:1:quote-high:quote-low",
      name: queueJobNames.continueNegotiation,
      payload: {
        currentQuoteId: "quote-high",
        negotiationId: "negotiation-high",
        runId: "run-1",
        truthfulCompetingQuoteId: "quote-low",
      },
      requestedAt: expect.any(String),
      traceId: "trace-1",
      version: 1,
    };
    expect(firstEnvelope).toEqual(expectedFollowUp);
    expect(secondEnvelope).toEqual(expectedFollowUp);
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

  it("revalidates and passes truthful leverage immediately before a follow-up call", async () => {
    const startCall = vi.fn(async () => ({
      ok: true as const,
      value: {
        providerCallId: "conversation-follow-up",
        status: "queued" as const,
        submittedAt: "2026-07-19T10:10:00.000Z",
      },
    }));
    const enqueue = vi.fn(async () => ({
      jobId: "outcome-job",
      queueName: queueNames.callExecution,
    }));
    const current = databaseLeverageQuote({
      amount: 221_000,
      businessId: "business-current",
      businessName: "Pine & Co.",
      id: "quote-current",
      negotiationId: "negotiation-current",
      negotiationStatus: NegotiationStatus.IN_PROGRESS,
    });
    const competing = databaseLeverageQuote({
      amount: 184_000,
      businessId: "business-competing",
      businessName: "Carolina Transit",
      id: "quote-competing",
      negotiationId: "negotiation-competing",
      negotiationStatus: NegotiationStatus.UNCHANGED,
    });
    const eventClient = eventTransactionClient(
      vi.fn(async () => ({ id: "event-1" })),
    );
    const client = {
      $transaction: vi.fn(async (operation: unknown) => {
        if (Array.isArray(operation)) return Promise.all(operation);
        return (operation as (value: unknown) => Promise<unknown>)(eventClient);
      }),
      call: {
        findUnique: vi.fn(async () => followUpCallFixture()),
        update: vi.fn(async () => ({ id: "call-follow-up" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      job: { update: vi.fn(async () => ({ id: "job-1" })) },
      negotiationRun: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      quote: leverageQuoteQueries(current, competing),
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider({ startCall }),
      client,
      enqueue,
    });
    const envelope = createQueueJob(
      queueJobNames.placeCall,
      {
        businessId: "business-current",
        callId: "call-follow-up",
        currentQuoteId: "quote-current",
        runId: "run-1",
        specificationVersionId: "version-1",
        strategy: "fee_removal",
        truthfulCompetingQuoteId: "quote-competing",
      },
      { idempotencyKey: "call-follow-up:place", traceId: "trace-1" },
    );

    await orchestrator.placeCall(envelope, processingContext());

    expect(startCall).toHaveBeenCalledWith(
      expect.objectContaining({
        truthfulLeverage: {
          competingBusinessName: "Carolina Transit",
          competingQuoteAmountMinor: 184_000,
          competingQuoteId: "quote-competing",
          currency: "USD",
          currentQuoteAmountMinor: 221_000,
          currentQuoteId: "quote-current",
        },
      }),
      expect.any(Object),
    );
  });

  it("withdraws a prior same-negotiation quote before saving its replacement", async () => {
    const withdrawPriorQuotes = vi.fn(async () => ({ count: 1 }));
    const createEvent = vi.fn(async () => ({ id: "event-1" }));
    const transactionClient = {
      ...eventTransactionClient(createEvent),
      call: { update: vi.fn(async () => ({ id: "call-follow-up" })) },
      evidence: { updateMany: vi.fn(async () => ({ count: 2 })) },
      negotiation: {
        update: vi.fn(async () => ({ id: "negotiation-current" })),
      },
      quote: {
        updateMany: withdrawPriorQuotes,
        upsert: vi.fn(async () => ({ id: "quote-replacement" })),
      },
      quoteItem: { upsert: vi.fn() },
    };
    const enqueue = vi.fn(async () => ({
      jobId: "rank-job",
      queueName: queueNames.quoteAnalysis,
    }));
    const extraction = {
      extractJobSpecification: vi.fn(),
      extractQuote: vi.fn(async () => ({
        ok: true as const,
        value: {
          quote: {
            businessId: "business-current",
            capturedAt: "2026-07-19T10:10:00.000Z",
            confidence: 0.98,
            estimateType: "binding" as const,
            fees: [],
            id: "quote-replacement",
            jobId: "job-1",
            pricingModel: "fixed" as const,
            status: "final" as const,
            totalPrice: { amountMinor: 184_000, currency: "USD" },
          },
          sourceSummary: "Confirmed total of $1,840.",
          warnings: [],
        },
      })),
      name: "fake-extraction",
    } as StructuredExtractionProvider;
    const client = {
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
      call: {
        findUnique: vi.fn(async () => normalizationCallFixture()),
      },
      evidence: {
        findFirst: vi.fn(async () => ({ id: "structured-evidence" })),
      },
      quote: { findUnique: vi.fn(async () => null) },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider(),
      client,
      enqueue,
      providers: { extraction },
    });
    const envelope = createQueueJob(
      queueJobNames.normalizeQuote,
      {
        callId: "call-follow-up",
        quoteId: "quote-replacement",
        runId: "run-1",
      },
      { idempotencyKey: "quote-replacement:normalize", traceId: "trace-1" },
    );

    await orchestrator.normalizeQuote(envelope, processingContext());

    expect(withdrawPriorQuotes).toHaveBeenCalledWith({
      data: { score: null, status: QuoteStatus.WITHDRAWN },
      where: {
        id: { not: "quote-replacement" },
        negotiationId: "negotiation-current",
        status: { not: QuoteStatus.WITHDRAWN },
      },
    });
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: queueJobNames.rankQuotes }),
    );
  });

  it("recovers a created follow-up call when its first enqueue fails", async () => {
    let createdCallId = "";
    const enqueue = vi
      .fn()
      .mockRejectedValueOnce(new Error("Redis was temporarily unavailable"))
      .mockResolvedValue({
        jobId: "place-job",
        queueName: queueNames.callExecution,
      });
    const createCall = vi.fn(async (input: { data: { id: string } }) => {
      createdCallId = input.data.id;
      return input.data;
    });
    const createEvent = vi.fn(async () => ({ id: "event-1" }));
    const transactionClient = eventTransactionClient(createEvent);
    const current = databaseLeverageQuote({
      amount: 221_000,
      businessId: "business-current",
      businessName: "Pine & Co.",
      id: "quote-current",
      negotiationId: "negotiation-current",
      negotiationStatus: NegotiationStatus.UNCHANGED,
    });
    const competing = databaseLeverageQuote({
      amount: 184_000,
      businessId: "business-competing",
      businessName: "Carolina Transit",
      id: "quote-competing",
      negotiationId: "negotiation-competing",
      negotiationStatus: NegotiationStatus.UNCHANGED,
    });
    const client = {
      $transaction: vi.fn(async (operation: unknown) => {
        if (Array.isArray(operation)) return Promise.all(operation);
        return (operation as (value: unknown) => Promise<unknown>)(
          transactionClient,
        );
      }),
      call: {
        create: createCall,
        findUnique: vi.fn(async () =>
          createdCallId
            ? {
                id: createdCallId,
                providerCallId: null,
                status: DatabaseCallStatus.QUEUED,
              }
            : null,
        ),
      },
      negotiation: {
        findUnique: vi.fn(async () => continuationNegotiationFixture()),
        update: vi.fn(async () => ({ id: "negotiation-current" })),
      },
      quote: leverageQuoteQueries(current, competing),
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider(),
      client,
      enqueue,
    });
    const envelope = continuationEnvelope();

    await expect(
      orchestrator.continueNegotiation(envelope, processingContext()),
    ).rejects.toThrow(/temporarily unavailable/);
    await orchestrator.continueNegotiation(envelope, processingContext());

    expect(createCall).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: queueJobNames.placeCall,
        payload: expect.objectContaining({
          callId: createdCallId,
          currentQuoteId: "quote-current",
          truthfulCompetingQuoteId: "quote-competing",
        }),
      }),
    );
  });

  it("compensates a terminal continuation failure and schedules ranking", async () => {
    const enqueue = vi.fn(async () => ({
      jobId: "rank-job",
      queueName: queueNames.quoteAnalysis,
    }));
    const updateNegotiation = vi.fn(async () => ({ count: 1 }));
    const createEvent = vi.fn(async () => ({ id: "event-1" }));
    const transactionClient = {
      ...eventTransactionClient(createEvent),
      call: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
      },
      negotiation: { updateMany: updateNegotiation },
    };
    const client = {
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
      call: { findUnique: vi.fn(async () => null) },
      negotiation: {
        findUnique: vi.fn(async () => continuationNegotiationFixture()),
      },
      quote: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
      },
    } as unknown as DatabaseClient;
    const orchestrator = createOrchestrator({
      callProvider: fakeCallProvider(),
      client,
      enqueue,
    });

    await expect(
      orchestrator.continueNegotiation(
        continuationEnvelope(),
        processingContext(),
      ),
    ).rejects.toThrow(/latest active, transcript-evidenced/);

    expect(updateNegotiation).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: NegotiationStatus.FAILED }),
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: queueJobNames.rankQuotes }),
    );
  });
});

function createOrchestrator(input: {
  readonly callProvider: CallProvider;
  readonly client: DatabaseClient;
  readonly enqueue: ReturnType<typeof vi.fn>;
  readonly providers?: Partial<WorkerProviderSet>;
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
    { calls: input.callProvider, ...input.providers },
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

function continuationEnvelope() {
  return createQueueJob(
    queueJobNames.continueNegotiation,
    {
      currentQuoteId: "quote-current",
      negotiationId: "negotiation-current",
      runId: "run-1",
      truthfulCompetingQuoteId: "quote-competing",
    },
    {
      idempotencyKey:
        "run-1:continue:negotiation-current:round:1:quote-current:quote-competing",
      traceId: "trace-1",
    },
  );
}

function continuationNegotiationFixture() {
  return {
    businessId: "business-current",
    calls: [],
    currentRound: 0,
    id: "negotiation-current",
    jobId: "job-1",
    metadata: null,
    run: {
      aiDisclosureAcknowledgedAt: new Date("2026-07-19T09:00:00.000Z"),
      id: "run-1",
      job: { currency: "USD" },
      recordingConsentAt: new Date("2026-07-19T09:00:00.000Z"),
      specificationVersionId: "version-1",
      status: NegotiationRunStatus.CALLING,
    },
    runId: "run-1",
    startedAt: new Date("2026-07-19T09:30:00.000Z"),
    strategy: "FEE_REMOVAL" as const,
  };
}

function followUpCallFixture() {
  const consentAt = new Date("2026-07-19T09:00:00.000Z");
  return {
    business: {
      address: { formattedAddress: "1 Pine St, Charlotte, NC" },
      externalId: "pine-1",
      id: "business-current",
      name: "Pine & Co.",
      phone: "+17045550101",
      provider: "google-places",
      rating: null,
      reviewCount: null,
      verification: { categories: ["moving_company"] },
      websiteUrl: null,
    },
    businessId: "business-current",
    id: "call-follow-up",
    job: { currency: "USD" },
    jobId: "job-1",
    locale: "en-US",
    negotiation: { id: "negotiation-current" },
    negotiationId: "negotiation-current",
    providerCallId: null,
    run: {
      aiDisclosureAcknowledgedAt: consentAt,
      callingConsentAt: consentAt,
      id: "run-1",
      recordingConsentAt: consentAt,
      specificationVersion: {
        specification: {
          bedrooms: 2,
          dropoffAddress: { formattedAddress: "200 Oak St, Raleigh, NC" },
          dropoffStairs: 0,
          hasElevator: false,
          inventory: [{ name: "Sofa", quantity: 1 }],
          movingDate: "2026-08-15",
          packingPreference: "partial",
          pickupAddress: { formattedAddress: "100 Main St, Charlotte, NC" },
          pickupStairs: 1,
          vertical: "moving",
        },
      },
      specificationVersionId: "version-1",
      startedAt: consentAt,
      status: NegotiationRunStatus.CALLING,
    },
    runId: "run-1",
    status: DatabaseCallStatus.QUEUED,
  };
}

function normalizationCallFixture() {
  return {
    business: { id: "business-current" },
    businessId: "business-current",
    endedAt: new Date("2026-07-19T10:10:00.000Z"),
    evidence: [
      {
        kind: EvidenceKind.TRANSCRIPT,
        retentionUntil: new Date("2026-08-18T10:10:00.000Z"),
        storageKey: "runs/run-1/calls/call-follow-up/transcript.txt",
      },
    ],
    id: "call-follow-up",
    job: { currency: "USD" },
    jobId: "job-1",
    negotiation: { id: "negotiation-current" },
    negotiationId: "negotiation-current",
    run: { id: "run-1" },
    runId: "run-1",
    status: DatabaseCallStatus.COMPLETED,
    structuredOutcome: { extraction: "queued" },
    transcriptText: "Business: The binding total is $1,840 including fees.",
  };
}

function databaseLeverageQuote(input: {
  readonly amount: number;
  readonly businessId: string;
  readonly businessName: string;
  readonly id: string;
  readonly negotiationId: string;
  readonly negotiationStatus: NegotiationStatus;
}) {
  return {
    business: { name: input.businessName },
    businessId: input.businessId,
    createdAt: new Date("2026-07-19T10:00:00.000Z"),
    currency: "USD",
    evidence: [{ kind: EvidenceKind.TRANSCRIPT }],
    id: input.id,
    negotiation: {
      businessId: input.businessId,
      runId: "run-1",
      status: input.negotiationStatus,
    },
    negotiationId: input.negotiationId,
    runId: "run-1",
    status: QuoteStatus.FINAL,
    totalAmountCents: input.amount,
  };
}

function leverageQuoteQueries(
  current: ReturnType<typeof databaseLeverageQuote>,
  competing: ReturnType<typeof databaseLeverageQuote>,
) {
  return {
    findFirst: vi.fn(async (input: { where: { negotiationId: string } }) => {
      if (input.where.negotiationId === current.negotiationId)
        return { id: current.id };
      if (input.where.negotiationId === competing.negotiationId)
        return { id: competing.id };
      return null;
    }),
    findUnique: vi.fn(async (input: { where: { id: string } }) => {
      if (input.where.id === current.id) return current;
      if (input.where.id === competing.id) return competing;
      return null;
    }),
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

function leverageQuote(input: {
  readonly amount: number;
  readonly businessId: string;
  readonly businessName: string;
  readonly id: string;
  readonly negotiationId: string;
  readonly negotiationStatus: NegotiationStatus;
}) {
  return {
    businessId: input.businessId,
    businessName: input.businessName,
    createdAt: new Date("2026-07-19T10:00:00.000Z"),
    currency: "USD",
    evidence: [{ kind: EvidenceKind.TRANSCRIPT }],
    id: input.id,
    negotiationBusinessId: input.businessId,
    negotiationId: input.negotiationId,
    negotiationRunId: "run-1",
    negotiationStatus: input.negotiationStatus,
    runId: "run-1",
    status: QuoteStatus.FINAL,
    totalAmountCents: input.amount,
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
