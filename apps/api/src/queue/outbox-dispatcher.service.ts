import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { parseQueueJobEnvelope } from "@relay/queue";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../database/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { QueueService } from "./queue.service.js";

const OUTBOX_INTERVAL_MS = 5_000;

@Injectable()
export class OutboxDispatcherService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | undefined;
  private publishing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queue.enabled || !this.prisma.configured) return;

    await this.publishPending();
    this.timer = setInterval(
      () => void this.publishPending(),
      OUTBOX_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async publishPending(aggregateId?: string): Promise<void> {
    if (!this.queue.enabled || !this.prisma.configured || this.publishing) {
      return;
    }

    this.publishing = true;
    try {
      const events = await this.prisma.client.outboxEvent.findMany({
        orderBy: { createdAt: "asc" },
        take: 100,
        where: {
          availableAt: { lte: new Date() },
          publishedAt: null,
          ...(aggregateId === undefined ? {} : { aggregateId }),
        },
      });

      for (const event of events) {
        try {
          const envelope = parseQueueJobEnvelope(event.payload);
          await this.queue.enqueue(envelope);
          await this.prisma.client.outboxEvent.update({
            data: {
              attempts: { increment: 1 },
              lastError: null,
              publishedAt: new Date(),
            },
            where: { id: event.id },
          });
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Unknown queue publication failure";
          await this.prisma.client.outboxEvent.update({
            data: {
              attempts: { increment: 1 },
              lastError: message,
              availableAt: new Date(Date.now() + OUTBOX_INTERVAL_MS),
            },
            where: { id: event.id },
          });
          this.logger.warn(
            `Outbox event ${event.id} remains pending (${event.eventType})`,
          );
        }
      }
    } finally {
      this.publishing = false;
    }
  }
}
