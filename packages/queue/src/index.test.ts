import { describe, expect, it } from "vitest";

import {
  createQueueJob,
  createQueueJobId,
  DisabledQueueProducer,
  getQueueName,
  InvalidQueueJobError,
  parseQueueJobEnvelope,
  QueueConfigurationError,
  QueueUnavailableError,
  queueForJob,
  queueJobNames,
  queueNames,
  queueRetryPolicies,
  resolveQueueRuntimeConfiguration,
} from "./index.js";

describe("queue contracts", () => {
  it("routes every public job name to a declared queue", () => {
    const declaredQueues = new Set(Object.values(queueNames));

    expect(Object.values(queueJobNames)).toHaveLength(
      Object.keys(queueForJob).length,
    );

    for (const jobName of Object.values(queueJobNames)) {
      expect(declaredQueues.has(getQueueName(jobName))).toBe(true);
      expect(queueRetryPolicies[jobName].attempts).toBeGreaterThan(1);
    }
  });

  it("keeps calls and analysis on separate queues", () => {
    expect(getQueueName(queueJobNames.placeCall)).toBe(
      queueNames.callExecution,
    );
    expect(getQueueName(queueJobNames.rankQuotes)).toBe(
      queueNames.quoteAnalysis,
    );
  });

  it("uses identifiers instead of embedding persistence records", () => {
    const job = discoverBusinessesJob();

    expect(job.payload).toEqual({
      jobId: "job_1",
      limit: 3,
      runId: "run_1",
      searchRadiusKm: 25,
      specificationVersionId: "specification_version_1",
    });
    expect(parseQueueJobEnvelope(job)).toEqual(job);
  });

  it("supports job-scoped discovery without manufacturing a run id", () => {
    const job = createQueueJob(
      queueJobNames.discoverBusinesses,
      {
        jobId: "job_1",
        limit: 3,
        searchRadiusKm: 25,
        specificationVersionId: "specification_version_1",
      },
      { idempotencyKey: "job_1:discover", traceId: "trace_1" },
    );

    expect(parseQueueJobEnvelope(job)).toEqual(job);
  });

  it("requires the source call when normalizing a quote", () => {
    const job = createQueueJob(
      queueJobNames.normalizeQuote,
      { callId: "call_1", quoteId: "quote_1", runId: "run_1" },
      { idempotencyKey: "quote_1:normalize", traceId: "trace_1" },
    );

    expect(parseQueueJobEnvelope(job)).toEqual(job);
    expect(() =>
      parseQueueJobEnvelope({
        ...job,
        payload: { quoteId: "quote_1", runId: "run_1" },
      }),
    ).toThrow(InvalidQueueJobError);
  });

  it("routes provider cancellation through the call execution queue", () => {
    const job = createQueueJob(
      queueJobNames.cancelCall,
      { callId: "call_1", runId: "run_1" },
      { idempotencyKey: "call_1:cancel", traceId: "trace_1" },
    );

    expect(getQueueName(job.name)).toBe(queueNames.callExecution);
    expect(parseQueueJobEnvelope(job)).toEqual(job);
  });

  it("rejects malformed or expanded payloads before processing", () => {
    const job = discoverBusinessesJob();

    expect(() =>
      parseQueueJobEnvelope({
        ...job,
        payload: {
          ...job.payload,
          customerAddress: "must not enter a queue payload",
        },
      }),
    ).toThrow(InvalidQueueJobError);
  });

  it("creates stable BullMQ-safe IDs without exposing the idempotency key", () => {
    const job = discoverBusinessesJob();
    const firstId = createQueueJobId(job);

    expect(createQueueJobId(job)).toBe(firstId);
    expect(firstId).not.toContain(":");
    expect(firstId).not.toContain(job.idempotencyKey);
    expect(
      createQueueJobId({ ...job, idempotencyKey: "run_1:discover:other" }),
    ).not.toBe(firstId);
  });
});

describe("queue runtime configuration", () => {
  it("stays disabled by default even when a local Redis URL exists", () => {
    expect(
      resolveQueueRuntimeConfiguration({
        NODE_ENV: "development",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toMatchObject({ enabled: false, provider: "memory" });
  });

  it("enables Redis only when explicitly selected and configured", () => {
    expect(
      resolveQueueRuntimeConfiguration({
        NODE_ENV: "development",
        QUEUE_PROVIDER: "redis",
        REDIS_URL: "rediss://relay:secret@redis.example.com:6380/2",
      }),
    ).toEqual({
      enabled: true,
      prefix: "relay",
      provider: "redis",
      redisUrl: "rediss://relay:secret@redis.example.com:6380/2",
    });
  });

  it("gracefully disables a local Redis provider without a URL", () => {
    expect(
      resolveQueueRuntimeConfiguration({
        NODE_ENV: "development",
        QUEUE_PROVIDER: "redis",
      }),
    ).toMatchObject({ enabled: false, provider: "redis" });
  });

  it("fails closed when production Redis configuration is missing", () => {
    expect(() =>
      resolveQueueRuntimeConfiguration({
        NODE_ENV: "production",
        QUEUE_PROVIDER: "redis",
      }),
    ).toThrow(QueueConfigurationError);
  });

  it("rejects unsupported providers and connection protocols", () => {
    expect(() =>
      resolveQueueRuntimeConfiguration({ QUEUE_PROVIDER: "unknown" }),
    ).toThrow(QueueConfigurationError);
    expect(() =>
      resolveQueueRuntimeConfiguration({
        QUEUE_PROVIDER: "redis",
        REDIS_URL: "https://redis.example.com",
      }),
    ).toThrow(QueueConfigurationError);
  });

  it("never silently accepts work while disabled", async () => {
    const producer = new DisabledQueueProducer("Redis is not configured");

    await expect(producer.enqueue(discoverBusinessesJob())).rejects.toThrow(
      QueueUnavailableError,
    );
    await expect(producer.close()).resolves.toBeUndefined();
  });
});

function discoverBusinessesJob() {
  return createQueueJob(
    queueJobNames.discoverBusinesses,
    {
      jobId: "job_1",
      limit: 3,
      runId: "run_1",
      searchRadiusKm: 25,
      specificationVersionId: "specification_version_1",
    },
    {
      idempotencyKey: "run_1:discover",
      requestedAt: "2026-07-19T00:00:00.000Z",
      traceId: "trace_1",
    },
  );
}
