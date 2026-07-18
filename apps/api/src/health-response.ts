import type { HealthResponse } from "@relay/contracts";

import { API_SERVICE_NAME, DEFAULT_APP_VERSION } from "./app.constants.js";

export function createHealthResponse(): HealthResponse {
  return {
    status: "ok",
    service: API_SERVICE_NAME,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION?.trim() || DEFAULT_APP_VERSION,
  };
}
