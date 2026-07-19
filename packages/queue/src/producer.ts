import type { QueueJobEnvelope, QueueJobName, QueueName } from "./contracts.js";

export interface EnqueueReceipt {
  readonly jobId: string;
  readonly queueName: QueueName;
}

export interface QueueProducer {
  readonly enabled: boolean;
  close(): Promise<void>;
  enqueue<Name extends QueueJobName>(
    envelope: QueueJobEnvelope<Name>,
  ): Promise<EnqueueReceipt>;
}

export class QueueUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueUnavailableError";
  }
}

export class DisabledQueueProducer implements QueueProducer {
  readonly enabled = false;

  constructor(private readonly reason: string) {}

  close(): Promise<void> {
    return Promise.resolve();
  }

  enqueue<Name extends QueueJobName>(
    envelope: QueueJobEnvelope<Name>,
  ): Promise<never> {
    void envelope;
    return Promise.reject(new QueueUnavailableError(this.reason));
  }
}
