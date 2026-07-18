import { describe, expect, it } from "vitest";

import {
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
});
