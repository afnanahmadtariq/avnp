import "reflect-metadata";

import { Logger, ShutdownSignal } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);
  Logger.log("Worker application context is ready", "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const detail = error instanceof Error ? error.stack : String(error);
  Logger.error("Worker failed to start", detail, "Bootstrap");
  process.exitCode = 1;
});
