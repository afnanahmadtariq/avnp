import { Controller, Get } from "@nestjs/common";

import { PublicRoute } from "./auth/public-route.decorator.js";
import type { HealthResponse } from "@relay/contracts";

import { createHealthResponse } from "./health-response.js";

@Controller("health")
@PublicRoute()
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return createHealthResponse();
  }
}
