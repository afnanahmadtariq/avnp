import { ValidationPipe, type INestApplication } from "@nestjs/common";

import { API_PREFIX, DEFAULT_LOCAL_CORS_ORIGINS } from "./app.constants.js";

export function resolveCorsOrigins(
  value = process.env.CORS_ORIGINS,
): true | string[] {
  if (value?.trim() === "*") {
    return true;
  }

  const configuredOrigins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return configuredOrigins?.length
    ? configuredOrigins
    : [...DEFAULT_LOCAL_CORS_ORIGINS];
}

export function configureApplication(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: resolveCorsOrigins(),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
