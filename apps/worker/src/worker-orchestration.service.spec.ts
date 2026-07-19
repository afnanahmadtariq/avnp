import type { DatabaseClient } from "@relay/database";
import {
  CallStatus as DatabaseCallStatus,
  NegotiationRunStatus,
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

import { WorkerOrchestrationService } from "./worker-orchestration.service.js";
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
