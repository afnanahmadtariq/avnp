import "reflect-metadata";

import { Logger, ShutdownSignal } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { DEFAULT_API_HOST, DEFAULT_API_PORT } from "./app.constants.js";
import { AppModule } from "./app.module.js";
import { configureApplication } from "./app.setup.js";

function resolvePort(value = process.env.API_PORT): number {
  const port = value === undefined ? DEFAULT_API_PORT : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `API_PORT must be an integer between 1 and 65535; received ${value}`,
    );
  }

  return port;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  const host = process.env.API_HOST?.trim() || DEFAULT_API_HOST;
  const port = resolvePort();

  await app.listen(port, host);
  Logger.log(`API ready at ${await app.getUrl()}/api/v1`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const detail = error instanceof Error ? error.stack : String(error);
  Logger.error("API failed to start", detail, "Bootstrap");
  process.exitCode = 1;
});
