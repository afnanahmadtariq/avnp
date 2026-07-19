import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  createQueueProducer,
  type QueueJobEnvelope,
  type QueueJobName,
  type QueueProducer,
  type EnqueueReceipt,
} from "@relay/queue";

import { QUEUE_RUNTIME_CONFIGURATION } from "./worker-runtime.service.js";
import type { QueueRuntimeConfiguration } from "@relay/queue";

@Injectable()
export class WorkerQueueProducerService
  implements OnModuleInit, OnModuleDestroy
{
  private producer: QueueProducer | undefined;

  constructor(
    @Inject(QUEUE_RUNTIME_CONFIGURATION)
    private readonly configuration: QueueRuntimeConfiguration,
  ) {}

  get enabled(): boolean {
    return this.producer?.enabled ?? false;
  }

  async onModuleInit(): Promise<void> {
    this.producer = await createQueueProducer(this.configuration);
  }

  async onModuleDestroy(): Promise<void> {
    const producer = this.producer;
    this.producer = undefined;
    await producer?.close();
  }

  enqueue<Name extends QueueJobName>(
    envelope: QueueJobEnvelope<Name>,
  ): Promise<EnqueueReceipt> {
    if (this.producer === undefined) {
      throw new Error("Queue producer is not initialized.");
    }

    return this.producer.enqueue(envelope);
  }
}
