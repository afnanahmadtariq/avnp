import { Controller, Get } from "@nestjs/common";

import { PublicRoute } from "./auth/public-route.decorator.js";
import type { HealthResponse } from "@relay/contracts";

import { createHealthResponse } from "./health-response.js";

@Controller()
@PublicRoute()
export class RootController {
  @Get()
  getStatus(): HealthResponse {
    return createHealthResponse();
  }
}
