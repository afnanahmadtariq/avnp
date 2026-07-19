import "reflect-metadata";

import { Logger, ShutdownSignal } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApplication } from "./app.setup.js";
import { RuntimeConfigService } from "./config/runtime-config.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(RuntimeConfigService).value;
  configureApplication(app, { corsOrigins: config.api.corsOrigins });
  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);

  await app.listen(config.api.port, config.api.host);
  Logger.log(`API ready at ${await app.getUrl()}/api/v1`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  const detail = error instanceof Error ? error.stack : String(error);
  Logger.error("API failed to start", detail, "Bootstrap");
  process.exitCode = 1;
});
