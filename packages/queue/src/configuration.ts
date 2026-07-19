export const DEFAULT_QUEUE_PREFIX = "relay";

export type QueueProvider = "memory" | "redis";

export interface DisabledQueueRuntimeConfiguration {
  readonly enabled: false;
  readonly provider: QueueProvider;
  readonly reason: string;
}

export interface RedisQueueRuntimeConfiguration {
  readonly enabled: true;
  readonly prefix: string;
  readonly provider: "redis";
  readonly redisUrl: string;
}

export type QueueRuntimeConfiguration =
  DisabledQueueRuntimeConfiguration | RedisQueueRuntimeConfiguration;

export class QueueConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueConfigurationError";
  }
}

export function resolveQueueRuntimeConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): QueueRuntimeConfiguration {
  const rawProvider = environment.QUEUE_PROVIDER?.trim().toLowerCase();
  const provider =
    rawProvider === undefined || rawProvider === "" ? "memory" : rawProvider;

  if (provider !== "memory" && provider !== "redis") {
    throw new QueueConfigurationError(
      'QUEUE_PROVIDER must be either "memory" or "redis"',
    );
  }

  if (provider === "memory") {
    return {
      enabled: false,
      provider,
      reason:
        "Durable queue processing is disabled while QUEUE_PROVIDER is memory",
    };
  }

  const redisUrl = environment.REDIS_URL?.trim();

  if (redisUrl === undefined || redisUrl === "") {
    if (environment.NODE_ENV === "production") {
      throw new QueueConfigurationError(
        "REDIS_URL is required when QUEUE_PROVIDER is redis in production",
      );
    }

    return {
      enabled: false,
      provider,
      reason:
        "Durable queue processing is disabled because REDIS_URL is not configured",
    };
  }

  validateRedisUrl(redisUrl);

  return {
    enabled: true,
    prefix: DEFAULT_QUEUE_PREFIX,
    provider,
    redisUrl,
  };
}

function validateRedisUrl(value: string): void {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new QueueConfigurationError("REDIS_URL must be a valid URL");
  }

  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new QueueConfigurationError(
      "REDIS_URL must use the redis or rediss protocol",
    );
  }

  if (url.hostname === "") {
    throw new QueueConfigurationError("REDIS_URL must include a hostname");
  }
}
