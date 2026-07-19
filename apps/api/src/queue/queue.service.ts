import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import {
  createQueueProducer,
  DisabledQueueProducer,
  resolveQueueRuntimeConfiguration,
  type QueueJobEnvelope,
  type QueueJobName,
  type QueueProducer,
} from "@relay/queue";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private producer: QueueProducer = new DisabledQueueProducer(
    "The queue producer has not started yet",
  );

  get enabled(): boolean {
    return this.producer.enabled;
  }

  async onModuleInit(): Promise<void> {
    const configuration = resolveQueueRuntimeConfiguration(process.env);
    this.producer = await createQueueProducer(configuration);

    if (configuration.enabled) {
      this.logger.log("Durable Redis queue producer is ready");
    } else {
      this.logger.log(configuration.reason);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.close();
  }

  enqueue<Name extends QueueJobName>(
    envelope: QueueJobEnvelope<Name>,
  ): ReturnType<QueueProducer["enqueue"]> {
    return this.producer.enqueue(envelope);
  }
}
