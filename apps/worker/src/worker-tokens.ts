import type { RelayRuntimeConfig } from "@relay/runtime-config";

export const WORKER_RUNTIME_CONFIG = Symbol("WORKER_RUNTIME_CONFIG");
export const WORKER_PROVIDER_SET = Symbol("WORKER_PROVIDER_SET");

export type WorkerRuntimeConfig = RelayRuntimeConfig;
