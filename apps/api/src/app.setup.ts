import { ValidationPipe, type INestApplication } from "@nestjs/common";

import { API_PREFIX, DEFAULT_LOCAL_CORS_ORIGINS } from "./app.constants.js";

interface ApplicationOptions {
  readonly corsOrigins?: readonly string[] | "*";
}

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

export function configureApplication(
  app: INestApplication,
  options: ApplicationOptions = {},
): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin:
      options.corsOrigins === "*"
        ? true
        : options.corsOrigins
          ? [...options.corsOrigins]
          : resolveCorsOrigins(),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
}
