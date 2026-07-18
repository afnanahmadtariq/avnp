import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@relay/contracts";

import { createHealthResponse } from "./health-response.js";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return createHealthResponse();
  }
}
