import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@relay/contracts";

import { createHealthResponse } from "./health-response.js";

@Controller()
export class RootController {
  @Get()
  getStatus(): HealthResponse {
    return createHealthResponse();
  }
}
