import "reflect-metadata";

import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  createQueueJob,
  NonRetryableQueueError,
  queueJobNames,
  queueNames,
  type QueueEnvelopeProcessor,
  type QueueProcessingContext,
  type RedisQueueRuntimeConfiguration,
} from "@relay/queue";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUnconfiguredJobHandlers,
  type WorkerJobHandlers,
} from "./job-handlers.js";
import {
  WorkerRuntimeService,
  type QueueWorkerHostFactory,
} from "./worker-runtime.service.js";
import { WorkerModule } from "./worker.module.js";

describe("WorkerModule", () => {
  let app: INestApplicationContext | undefined;
  const originalQueueProvider = process.env.QUEUE_PROVIDER;

  afterEach(async () => {
    await app?.close();
    app = undefined;

    if (originalQueueProvider === undefined) {
      delete process.env.QUEUE_PROVIDER;
    } else {
      process.env.QUEUE_PROVIDER = originalQueueProvider;
    }
  });

  it("becomes ready without Redis or outbound work", async () => {
    delete process.env.QUEUE_PROVIDER;
    app = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });

    const runtime = app.get(WorkerRuntimeService);

    expect(runtime.isReady()).toBe(true);
    expect(runtime.isEnabled()).toBe(false);
  });

  it("starts, dispatches, and gracefully closes an enabled worker host", async () => {
    const quoteRankHandler = vi.fn(async () => undefined);
    const handlers: WorkerJobHandlers = {
      ...createUnconfiguredJobHandlers(),
      [queueJobNames.rankQuotes]: quoteRankHandler,
    };
    const close = vi.fn(async () => undefined);
    let processor: QueueEnvelopeProcessor | undefined;
    const factory: QueueWorkerHostFactory = async (
      _configuration,
      configuredProcessor,
    ) => {
      processor = configuredProcessor;
      return { close, enabled: true };
    };
    const runtime = new WorkerRuntimeService(
      redisConfiguration(),
      handlers,
      factory,
    );

    await runtime.onApplicationBootstrap();

    expect(runtime.isReady()).toBe(true);
    expect(runtime.isEnabled()).toBe(true);
    expect(processor).toBeDefined();

    const envelope = createQueueJob(
      queueJobNames.rankQuotes,
      { runId: "run_1" },
      {
        idempotencyKey: "run_1:rank",
        requestedAt: "2026-07-19T00:00:00.000Z",
        traceId: "trace_1",
      },
    );
    const context = processingContext();

    await processor?.(envelope, context);

    expect(quoteRankHandler).toHaveBeenCalledWith(envelope, context);

    await runtime.onApplicationShutdown("SIGTERM");

    expect(close).toHaveBeenCalledOnce();
    expect(runtime.isReady()).toBe(false);
    expect(runtime.isEnabled()).toBe(false);
  });

  it("fails unconfigured jobs without retrying provider side effects", async () => {
    const handlers = createUnconfiguredJobHandlers();
    const envelope = createQueueJob(
      queueJobNames.placeCall,
      {
        businessId: "business_1",
        callId: "call_1",
        runId: "run_1",
        specificationVersionId: "specification_version_1",
        strategy: "discount_request",
      },
      {
        idempotencyKey: "call_1:place",
        requestedAt: "2026-07-19T00:00:00.000Z",
        traceId: "trace_1",
      },
    );

    await expect(
      handlers[queueJobNames.placeCall](envelope, processingContext()),
    ).rejects.toThrow(NonRetryableQueueError);
  });
});

function redisConfiguration(): RedisQueueRuntimeConfiguration {
  return {
    enabled: true,
    prefix: "relay-test",
    provider: "redis",
    redisUrl: "redis://localhost:6379/15",
  };
}

function processingContext(): QueueProcessingContext {
  return {
    attempt: 1,
    attemptsAllowed: 3,
    bullJobId: "bull-job-1",
    queueName: queueNames.quoteAnalysis,
    updateProgress: async () => undefined,
  };
}
