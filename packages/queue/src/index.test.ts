import { describe, expect, it } from "vitest";

import {
  createQueueJob,
  getQueueName,
  queueForJob,
  queueJobNames,
  queueNames,
} from "./index.js";

describe("queue contracts", () => {
  it("routes every public job name to a declared queue", () => {
    const declaredQueues = new Set(Object.values(queueNames));

    expect(Object.values(queueJobNames)).toHaveLength(
      Object.keys(queueForJob).length,
    );

    for (const jobName of Object.values(queueJobNames)) {
      expect(declaredQueues.has(getQueueName(jobName))).toBe(true);
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
    const job = createQueueJob(
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

    expect(job.payload).toEqual({
      jobId: "job_1",
      limit: 3,
      runId: "run_1",
      searchRadiusKm: 25,
      specificationVersionId: "specification_version_1",
    });
  });
});
