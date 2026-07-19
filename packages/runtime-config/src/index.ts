import { z } from "zod";

const localCorsOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];

const environmentSchema = z.enum(["development", "production", "test"]);
const relayModeSchema = z.enum(["fixture", "live"]);
const authProviderSchema = z.enum(["clerk", "local"]);
const queueProviderSchema = z.enum(["memory", "redis"]);
const discoveryProviderSchema = z.enum(["fixture", "google"]);
const callProviderSchema = z.enum(["elevenlabs", "fixture"]);
const aiProviderSchema = z.enum(["fixture", "openai"]);
const storageProviderSchema = z.enum(["local", "supabase"]);
const documentProviderSchema = z.enum(["mock", "openai"]);

export type RelayMode = z.infer<typeof relayModeSchema>;
export type AuthProviderName = z.infer<typeof authProviderSchema>;
export type QueueProviderName = z.infer<typeof queueProviderSchema>;
export type DiscoveryProviderName = z.infer<typeof discoveryProviderSchema>;
export type CallProviderName = z.infer<typeof callProviderSchema>;
export type AiProviderName = z.infer<typeof aiProviderSchema>;
export type StorageProviderName = z.infer<typeof storageProviderSchema>;
export type DocumentProviderName = z.infer<typeof documentProviderSchema>;

export interface RelayRuntimeConfig {
  readonly ai: {
    readonly apiKey: string | undefined;
    readonly model: string;
    readonly provider: AiProviderName;
  };
  readonly api: {
    readonly corsOrigins: readonly string[] | "*";
    readonly host: string;
    readonly port: number;
    readonly publicUrl: string | undefined;
  };
  readonly auth: {
    readonly clerkPublishableKey: string | undefined;
    readonly clerkSecretKey: string | undefined;
    readonly provider: AuthProviderName;
  };
  readonly call: {
    readonly agentId: string | undefined;
    readonly apiKey: string | undefined;
    readonly interviewAgentId?: string | undefined;
    readonly phoneNumberId: string | undefined;
    readonly provider: CallProviderName;
    readonly twilioAccountSid?: string | undefined;
    readonly twilioAuthToken?: string | undefined;
    readonly webhookSecret: string | undefined;
  };
  readonly databaseUrl: string | undefined;
  readonly discovery: {
    readonly googlePlacesApiKey: string | undefined;
    readonly provider: DiscoveryProviderName;
  };
  readonly document: {
    readonly provider: DocumentProviderName;
  };
  readonly environment: z.infer<typeof environmentSchema>;
  readonly mode: RelayMode;
  readonly providerTimeoutMs: number;
  readonly queue: {
    readonly provider: QueueProviderName;
    readonly redisUrl: string | undefined;
  };
  readonly storage: {
    readonly bucket: string;
    readonly provider: StorageProviderName;
    readonly serviceRoleKey: string | undefined;
    readonly supabaseUrl: string | undefined;
  };
  readonly version: string;
}

export class RuntimeConfigurationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    const uniqueVariables = [...new Set(variables)].sort();
    super(
      `Relay live configuration is incomplete. Configure: ${uniqueVariables.join(", ")}.`,
    );
    this.name = "RuntimeConfigurationError";
    this.variables = uniqueVariables;
  }
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function enumValue<Schema extends z.ZodEnum>(
  schema: Schema,
  value: string | undefined,
  fallback: z.infer<Schema>,
  variable: string,
): z.infer<Schema> {
  const result = schema.safeParse(optionalValue(value) ?? fallback);
  if (!result.success) {
    throw new RuntimeConfigurationError([variable]);
  }
  return result.data;
}

function integerValue(
  value: string | undefined,
  fallback: number,
  variable: string,
  range: { readonly maximum: number; readonly minimum: number },
): number {
  const normalized = optionalValue(value);
  const parsed = normalized === undefined ? fallback : Number(normalized);
  if (
    !Number.isInteger(parsed) ||
    parsed < range.minimum ||
    parsed > range.maximum
  ) {
    throw new RuntimeConfigurationError([variable]);
  }
  return parsed;
}

function urlValue(
  value: string | undefined,
  variable: string,
): string | undefined {
  const normalized = optionalValue(value);
  if (!normalized) return undefined;

  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    throw new RuntimeConfigurationError([variable]);
  }
}

function corsOrigins(value: string | undefined): readonly string[] | "*" {
  const normalized = optionalValue(value);
  if (normalized === "*") return "*";
  if (!normalized) return localCorsOrigins;

  const origins = normalized
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (
    origins.length === 0 ||
    origins.some((origin) => !urlValue(origin, "CORS_ORIGINS"))
  ) {
    throw new RuntimeConfigurationError(["CORS_ORIGINS"]);
  }

  return origins;
}

function requireValues(
  environment: NodeJS.ProcessEnv,
  variables: readonly string[],
  missing: string[],
): void {
  for (const variable of variables) {
    if (!optionalValue(environment[variable])) missing.push(variable);
  }
}

function validateLiveConfiguration(
  config: RelayRuntimeConfig,
  environment: NodeJS.ProcessEnv,
): void {
  if (config.mode !== "live") return;

  const missing: string[] = [];
  requireValues(environment, ["DATABASE_URL", "API_PUBLIC_URL"], missing);

  if (config.api.corsOrigins === "*") missing.push("CORS_ORIGINS");
  if (config.auth.provider === "clerk") {
    requireValues(
      environment,
      ["CLERK_SECRET_KEY", "NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      missing,
    );
  }
  if (config.queue.provider === "redis") {
    requireValues(environment, ["REDIS_URL"], missing);
  }
  if (config.discovery.provider === "google") {
    requireValues(environment, ["GOOGLE_PLACES_API_KEY"], missing);
  }
  if (config.call.provider === "elevenlabs") {
    requireValues(
      environment,
      [
        "ELEVENLABS_API_KEY",
        "ELEVENLABS_AGENT_ID",
        "ELEVENLABS_PHONE_NUMBER_ID",
        "ELEVENLABS_WEBHOOK_SECRET",
      ],
      missing,
    );
  }
  if (
    config.ai.provider === "openai" ||
    config.document.provider === "openai"
  ) {
    requireValues(environment, ["OPENAI_API_KEY", "OPENAI_MODEL"], missing);
  }
  if (config.storage.provider === "supabase") {
    requireValues(
      environment,
      ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"],
      missing,
    );
  }

  if (missing.length > 0) throw new RuntimeConfigurationError(missing);
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): RelayRuntimeConfig {
  const nodeEnvironment = enumValue(
    environmentSchema,
    environment.NODE_ENV,
    "development",
    "NODE_ENV",
  );
  const mode = enumValue(
    relayModeSchema,
    environment.RELAY_MODE,
    nodeEnvironment === "production" ? "live" : "fixture",
    "RELAY_MODE",
  );
  const live = mode === "live";

  const config: RelayRuntimeConfig = {
    ai: {
      apiKey: optionalValue(environment.OPENAI_API_KEY),
      model: optionalValue(environment.OPENAI_MODEL) ?? "gpt-5.6-luna",
      provider: enumValue(
        aiProviderSchema,
        environment.AI_PROVIDER,
        live ? "openai" : "fixture",
        "AI_PROVIDER",
      ),
    },
    api: {
      corsOrigins: corsOrigins(environment.CORS_ORIGINS),
      host: optionalValue(environment.API_HOST) ?? "0.0.0.0",
      port: integerValue(environment.API_PORT, 4000, "API_PORT", {
        maximum: 65_535,
        minimum: 1,
      }),
      publicUrl: urlValue(environment.API_PUBLIC_URL, "API_PUBLIC_URL"),
    },
    auth: {
      clerkPublishableKey: optionalValue(
        environment.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      ),
      clerkSecretKey: optionalValue(environment.CLERK_SECRET_KEY),
      provider: enumValue(
        authProviderSchema,
        environment.AUTH_PROVIDER,
        live ? "clerk" : "local",
        "AUTH_PROVIDER",
      ),
    },
    call: {
      agentId: optionalValue(environment.ELEVENLABS_AGENT_ID),
      apiKey: optionalValue(environment.ELEVENLABS_API_KEY),
      interviewAgentId:
        optionalValue(environment.ELEVENLABS_INTERVIEW_AGENT_ID) ??
        optionalValue(environment.ELEVENLABS_AGENT_ID),
      phoneNumberId: optionalValue(environment.ELEVENLABS_PHONE_NUMBER_ID),
      provider: enumValue(
        callProviderSchema,
        environment.CALL_PROVIDER,
        live ? "elevenlabs" : "fixture",
        "CALL_PROVIDER",
      ),
      twilioAccountSid: optionalValue(environment.TWILIO_ACCOUNT_SID),
      twilioAuthToken: optionalValue(environment.TWILIO_AUTH_TOKEN),
      webhookSecret: optionalValue(environment.ELEVENLABS_WEBHOOK_SECRET),
    },
    databaseUrl: urlValue(environment.DATABASE_URL, "DATABASE_URL"),
    discovery: {
      googlePlacesApiKey: optionalValue(environment.GOOGLE_PLACES_API_KEY),
      provider: enumValue(
        discoveryProviderSchema,
        environment.DISCOVERY_PROVIDER,
        live ? "google" : "fixture",
        "DISCOVERY_PROVIDER",
      ),
    },
    document: {
      provider: enumValue(
        documentProviderSchema,
        environment.OCR_PROVIDER,
        live ? "openai" : "mock",
        "OCR_PROVIDER",
      ),
    },
    environment: nodeEnvironment,
    mode,
    providerTimeoutMs: integerValue(
      environment.PROVIDER_TIMEOUT_MS,
      20_000,
      "PROVIDER_TIMEOUT_MS",
      { maximum: 120_000, minimum: 1_000 },
    ),
    queue: {
      provider: enumValue(
        queueProviderSchema,
        environment.QUEUE_PROVIDER,
        live ? "redis" : "memory",
        "QUEUE_PROVIDER",
      ),
      redisUrl: urlValue(environment.REDIS_URL, "REDIS_URL"),
    },
    storage: {
      bucket:
        optionalValue(environment.SUPABASE_STORAGE_BUCKET) ?? "relay-evidence",
      provider: enumValue(
        storageProviderSchema,
        environment.STORAGE_PROVIDER,
        live ? "supabase" : "local",
        "STORAGE_PROVIDER",
      ),
      serviceRoleKey: optionalValue(environment.SUPABASE_SERVICE_ROLE_KEY),
      supabaseUrl: urlValue(environment.SUPABASE_URL, "SUPABASE_URL"),
    },
    version: optionalValue(environment.APP_VERSION) ?? "0.0.0",
  };

  validateLiveConfiguration(config, environment);
  return config;
}
