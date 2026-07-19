import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type {
  QueueEnvelopeProcessor,
  QueueRuntimeConfiguration,
  QueueWorkerHost,
  QueueWorkerObserver,
  RedisQueueRuntimeConfiguration,
} from "@relay/queue";

import {
  dispatchQueueJob,
  QUEUE_JOB_HANDLERS,
  type WorkerJobHandlers,
} from "./job-handlers.js";

export const QUEUE_RUNTIME_CONFIGURATION = Symbol(
  "QUEUE_RUNTIME_CONFIGURATION",
);
export const QUEUE_WORKER_HOST_FACTORY = Symbol("QUEUE_WORKER_HOST_FACTORY");

export type QueueWorkerHostFactory = (
  configuration: RedisQueueRuntimeConfiguration,
  processor: QueueEnvelopeProcessor,
  observer: QueueWorkerObserver,
) => Promise<QueueWorkerHost>;

const DISABLED_KEEP_ALIVE_INTERVAL_MS = 60_000;

@Injectable()
export class WorkerRuntimeService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private disabledKeepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private workerHost: QueueWorkerHost | undefined;
  private enabled = false;
  private ready = false;

  constructor(
    @Inject(QUEUE_RUNTIME_CONFIGURATION)
    private readonly configuration: QueueRuntimeConfiguration,
    @Inject(QUEUE_JOB_HANDLERS)
    private readonly handlers: WorkerJobHandlers,
    @Inject(QUEUE_WORKER_HOST_FACTORY)
    private readonly createWorkerHost: QueueWorkerHostFactory,
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  isReady(): boolean {
    return this.ready;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.configuration.enabled) {
      this.disabledKeepAliveTimer = setInterval(
        () => undefined,
        DISABLED_KEEP_ALIVE_INTERVAL_MS,
      );
      this.enabled = false;
      this.ready = true;
      this.logger.log(this.configuration.reason);
      return;
    }

    const processor: QueueEnvelopeProcessor = async (envelope, context) =>
      dispatchQueueJob(this.handlers, envelope, context);

    this.workerHost = await this.createWorkerHost(
      this.configuration,
      processor,
      this.createObserver(),
    );
    this.enabled = this.workerHost.enabled;
    this.ready = true;
    this.logger.log("Durable Redis queue workers are ready");
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.ready = false;
    this.enabled = false;

    if (this.disabledKeepAliveTimer !== undefined) {
      clearInterval(this.disabledKeepAliveTimer);
      this.disabledKeepAliveTimer = undefined;
    }

    const workerHost = this.workerHost;
    this.workerHost = undefined;
    await workerHost?.close();

    this.logger.log(
      signal ? `Worker stopped after ${signal}` : "Worker stopped gracefully",
    );
  }

  private createObserver(): QueueWorkerObserver {
    return {
      completed: ({ bullJobId, name, queueName }) => {
        this.logger.log(`Completed ${name} job ${bullJobId} on ${queueName}`);
      },
      error: (queueName, error) => {
        this.logger.error(`Queue worker error on ${queueName} (${error.name})`);
      },
      failed: ({ attemptsMade, bullJobId, name, queueName }) => {
        this.logger.warn(
          `Failed ${name} job ${bullJobId} on ${queueName} after ` +
            `${attemptsMade} attempt(s)`,
        );
      },
    };
  }
}
