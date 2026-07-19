import { Queue, UnrecoverableError, Worker } from "bullmq";
import type { ConnectionOptions, Job } from "bullmq";

import type { RedisQueueRuntimeConfiguration } from "./configuration.js";
import {
  createQueueJobId,
  getQueueName,
  InvalidQueueJobError,
  NonRetryableQueueError,
  parseQueueJobEnvelope,
  queueNames,
  type AnyQueueJobEnvelope,
  type QueueJobEnvelope,
  type QueueJobName,
  type QueueName,
} from "./contracts.js";
import type { EnqueueReceipt, QueueProducer } from "./producer.js";
import { queueRetryPolicies } from "./retry-policy.js";

const SECONDS_PER_DAY = 86_400;
const DEFAULT_WORKER_CONCURRENCY = 4;

const retentionOptions = {
  removeOnComplete: {
    age: 7 * SECONDS_PER_DAY,
    count: 100_000,
  },
  removeOnFail: {
    age: 30 * SECONDS_PER_DAY,
    count: 100_000,
  },
} as const;

export interface QueueProcessingContext {
  readonly attempt: number;
  readonly attemptsAllowed: number;
  readonly bullJobId: string;
  readonly queueName: QueueName;
  readonly signal?: AbortSignal;
  updateProgress(progress: number | object): Promise<void>;
}

export type QueueEnvelopeProcessor = (
  envelope: AnyQueueJobEnvelope,
  context: QueueProcessingContext,
) => Promise<void>;

export interface QueueWorkerCompletedEvent {
  readonly bullJobId: string;
  readonly name: QueueJobName;
  readonly queueName: QueueName;
}

export interface QueueWorkerFailedEvent extends QueueWorkerCompletedEvent {
  readonly attemptsMade: number;
  readonly error: Error;
}

export interface QueueWorkerObserver {
  completed?(event: QueueWorkerCompletedEvent): void;
  error?(queueName: QueueName, error: Error): void;
  failed?(event: QueueWorkerFailedEvent): void;
}

export interface QueueWorkerHost {
  readonly enabled: boolean;
  close(): Promise<void>;
}

export class BullMqQueueProducer implements QueueProducer {
  readonly enabled = true;
  private readonly queues = new Map<QueueName, Queue>();
  private closed = false;

  private constructor(configuration: RedisQueueRuntimeConfiguration) {
    for (const queueName of Object.values(queueNames)) {
      this.queues.set(
        queueName,
        new Queue(queueName, {
          connection: createRedisConnectionOptions(
            configuration.redisUrl,
            "producer",
          ),
          prefix: configuration.prefix,
        }),
      );
    }
  }

  static async create(
    configuration: RedisQueueRuntimeConfiguration,
  ): Promise<BullMqQueueProducer> {
    const producer = new BullMqQueueProducer(configuration);

    try {
      await Promise.all(
        [...producer.queues.values()].map(async (queue) =>
          queue.waitUntilReady(),
        ),
      );
      return producer;
    } catch (error) {
      await producer.close();
      throw asError(error);
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await Promise.all(
      [...this.queues.values()].map(async (queue) => queue.close()),
    );
    this.queues.clear();
  }

  async enqueue<Name extends QueueJobName>(
    envelope: QueueJobEnvelope<Name>,
  ): Promise<EnqueueReceipt> {
    if (this.closed) {
      throw new Error("Queue producer is closed");
    }

    const validatedEnvelope = parseQueueJobEnvelope(envelope);
    const queueName = getQueueName(validatedEnvelope.name);
    const queue = this.queues.get(queueName);

    if (queue === undefined) {
      throw new Error(`Queue ${queueName} is unavailable`);
    }

    const jobId = createQueueJobId(validatedEnvelope);
    const retryPolicy = queueRetryPolicies[validatedEnvelope.name];
    const job = await queue.add(validatedEnvelope.name, validatedEnvelope, {
      ...retentionOptions,
      ...retryPolicy,
      jobId,
    });

    return {
      jobId: job.id ?? jobId,
      queueName,
    };
  }
}

class BullMqQueueWorkerHost implements QueueWorkerHost {
  readonly enabled = true;
  private closed = false;

  private constructor(private readonly workers: readonly Worker[]) {}

  static async create(
    configuration: RedisQueueRuntimeConfiguration,
    processor: QueueEnvelopeProcessor,
    observer?: QueueWorkerObserver,
  ): Promise<BullMqQueueWorkerHost> {
    const workers = Object.values(queueNames).map((queueName) => {
      const worker = new Worker(
        queueName,
        async (job: Job, _token?: string, signal?: AbortSignal) => {
          await processBullMqJob(queueName, job, processor, signal);
        },
        {
          autorun: true,
          concurrency: workerConcurrency(queueName),
          connection: createRedisConnectionOptions(
            configuration.redisUrl,
            "worker",
          ),
          maxStalledCount: 2,
          prefix: configuration.prefix,
        },
      );

      worker.on("completed", (job: Job) => {
        const envelope = safeParseEnvelope(job.data);

        if (envelope !== undefined) {
          observer?.completed?.({
            bullJobId: job.id ?? createQueueJobId(envelope),
            name: envelope.name,
            queueName,
          });
        }
      });
      worker.on("failed", (job: Job | undefined, error: Error) => {
        const envelope = safeParseEnvelope(job?.data);

        if (job !== undefined && envelope !== undefined) {
          observer?.failed?.({
            attemptsMade: job.attemptsMade,
            bullJobId: job.id ?? createQueueJobId(envelope),
            error,
            name: envelope.name,
            queueName,
          });
        }
      });
      worker.on("error", (error: Error) => observer?.error?.(queueName, error));
      return worker;
    });

    const host = new BullMqQueueWorkerHost(workers);

    try {
      await Promise.all(workers.map(async (worker) => worker.waitUntilReady()));
      return host;
    } catch (error) {
      await host.close();
      throw asError(error);
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await Promise.all(this.workers.map(async (worker) => worker.close()));
  }
}

export async function createBullMqQueueWorkerHost(
  configuration: RedisQueueRuntimeConfiguration,
  processor: QueueEnvelopeProcessor,
  observer?: QueueWorkerObserver,
): Promise<QueueWorkerHost> {
  return BullMqQueueWorkerHost.create(configuration, processor, observer);
}

async function processBullMqJob(
  queueName: QueueName,
  job: Job,
  processor: QueueEnvelopeProcessor,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const envelope = parseQueueJobEnvelope(job.data);

    if (
      job.name !== envelope.name ||
      getQueueName(envelope.name) !== queueName
    ) {
      throw new InvalidQueueJobError(
        "Queue job name or routing key does not match its envelope",
      );
    }

    const context: QueueProcessingContext = {
      attempt: job.attemptsMade + 1,
      attemptsAllowed: job.opts.attempts ?? 1,
      bullJobId: job.id ?? createQueueJobId(envelope),
      queueName,
      updateProgress: async (progress) => job.updateProgress(progress),
      ...(signal === undefined ? {} : { signal }),
    };

    await processor(envelope, context);
  } catch (error) {
    if (
      error instanceof InvalidQueueJobError ||
      error instanceof NonRetryableQueueError
    ) {
      throw new UnrecoverableError(error.message);
    }

    throw asError(error);
  }
}

function safeParseEnvelope(value: unknown): AnyQueueJobEnvelope | undefined {
  try {
    return parseQueueJobEnvelope(value);
  } catch {
    return undefined;
  }
}

function workerConcurrency(queueName: QueueName): number {
  return queueName === queueNames.callExecution
    ? 3
    : DEFAULT_WORKER_CONCURRENCY;
}

function createRedisConnectionOptions(
  redisUrl: string,
  role: "producer" | "worker",
): ConnectionOptions {
  const url = new URL(redisUrl);
  const databasePath = url.pathname.replace(/^\//, "");
  const database = databasePath === "" ? 0 : Number(databasePath);
  const port = url.port === "" ? 6379 : Number(url.port);

  if (!Number.isInteger(database) || database < 0) {
    throw new Error("REDIS_URL database path must be a non-negative integer");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("REDIS_URL port must be between 1 and 65535");
  }

  return {
    db: database,
    host: url.hostname,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    port,
    ...(url.password === ""
      ? {}
      : { password: decodeURIComponent(url.password) }),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    ...(url.username === ""
      ? {}
      : { username: decodeURIComponent(url.username) }),
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
