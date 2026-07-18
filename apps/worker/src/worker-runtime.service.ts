import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

const IDLE_HEARTBEAT_INTERVAL_MS = 60_000;

@Injectable()
export class WorkerRuntimeService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private ready = false;

  isReady(): boolean {
    return this.ready;
  }

  onApplicationBootstrap(): void {
    this.keepAliveTimer = setInterval(
      () => undefined,
      IDLE_HEARTBEAT_INTERVAL_MS,
    );
    this.ready = true;
    this.logger.log(
      "Worker ready and idle; no provider calls start until work is " +
        "explicitly configured",
    );
  }

  onApplicationShutdown(signal?: string): void {
    if (this.keepAliveTimer !== undefined) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }

    this.ready = false;
    this.logger.log(
      signal ? `Worker stopped after ${signal}` : "Worker stopped gracefully",
    );
  }
}
