import { Queue, type ConnectionOptions } from "bullmq";
import { describe, expect, it } from "vitest";

import {
  createQueueJob,
  createQueueProducer,
  createQueueWorkerHost,
  queueJobNames,
  queueNames,
  type QueueWorkerHost,
  type RedisQueueRuntimeConfiguration,
} from "./index.js";

const redisUrl = process.env.REDIS_URL;
const integrationEnabled =
  process.env.QUEUE_PROVIDER === "redis" && redisUrl !== undefined;

describe.runIf(integrationEnabled)("BullMQ Redis round trip", () => {
  it("deduplicates, retries, processes, closes, and cleans up", async () => {
    if (redisUrl === undefined) {
      throw new Error("REDIS_URL is required for this integration test");
    }

    const prefix = `relay-integration-${process.pid}-${Date.now()}`;
    const configuration: RedisQueueRuntimeConfiguration = {
      enabled: true,
      prefix,
      provider: "redis",
      redisUrl,
    };
    const envelope = createQueueJob(
      queueJobNames.rankQuotes,
      { runId: "integration_run" },
      {
        idempotencyKey: "integration_run-rank",
        requestedAt: new Date().toISOString(),
        traceId: "integration_trace",
      },
    );
    const producer = await createQueueProducer(configuration);
    let workerHost: QueueWorkerHost | undefined;
    let attempts = 0;
    let complete: (() => void) | undefined;
    const completion = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const timeout = createTimeout(12_000);

    try {
      const first = await producer.enqueue(envelope);
      const duplicate = await producer.enqueue(envelope);

      expect(duplicate.jobId).toBe(first.jobId);

      workerHost = await createQueueWorkerHost(
        configuration,
        async (received, context) => {
          attempts += 1;
          expect(received.idempotencyKey).toBe(envelope.idempotencyKey);

          if (attempts === 1) {
            throw new Error("Intentional transient integration failure");
          }

          expect(context.attempt).toBe(2);
          expect(context.attemptsAllowed).toBe(5);
          complete?.();
        },
      );

      await Promise.race([completion, timeout.promise]);
      expect(attempts).toBe(2);
    } finally {
      timeout.cancel();
      await workerHost?.close();
      await producer.close();
      await cleanQueues(prefix, redisUrl);
    }
  }, 15_000);
});

function createTimeout(milliseconds: number): {
  readonly cancel: () => void;
  readonly promise: Promise<never>;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("BullMQ integration test timed out")),
      milliseconds,
    );
  });

  return {
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    },
    promise,
  };
}

async function cleanQueues(
  prefix: string,
  connectionUrl: string,
): Promise<void> {
  const connection = redisConnectionOptions(connectionUrl);

  for (const queueName of Object.values(queueNames)) {
    const queue = new Queue(queueName, { connection, prefix });
    await queue.obliterate({ force: true });
    await queue.close();
  }
}

function redisConnectionOptions(value: string): ConnectionOptions {
  const url = new URL(value);
  const databasePath = url.pathname.replace(/^\//, "");

  return {
    db: databasePath === "" ? 0 : Number(databasePath),
    host: url.hostname,
    maxRetriesPerRequest: 1,
    port: url.port === "" ? 6379 : Number(url.port),
    ...(url.password === ""
      ? {}
      : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    ...(url.username === ""
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}
