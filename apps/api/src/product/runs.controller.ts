import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

// Runtime imports are required for Nest's emitted validation and injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RunEventsQueryDto, SaveDecisionDto } from "./product.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service.js";

@Controller("runs")
export class RunsController {
  constructor(private readonly productService: ProductService) {}

  @Get(":runId")
  getRun(@Param("runId") runId: string): Promise<unknown> {
    return this.productService.getRun(runId);
  }

  @Get(":runId/events")
  getEvents(
    @Param("runId") runId: string,
    @Query() query: RunEventsQueryDto,
  ): Promise<unknown> {
    return this.productService.getRunEvents(runId, query.after);
  }

  @Post(":runId/pause")
  @HttpCode(HttpStatus.OK)
  pauseRun(@Param("runId") runId: string): Promise<unknown> {
    return this.productService.pauseRun(runId);
  }

  @Post(":runId/resume")
  @HttpCode(HttpStatus.OK)
  resumeRun(@Param("runId") runId: string): Promise<unknown> {
    return this.productService.resumeRun(runId);
  }

  @Post(":runId/cancel")
  @HttpCode(HttpStatus.OK)
  cancelRun(@Param("runId") runId: string): Promise<unknown> {
    return this.productService.cancelRun(runId);
  }

  @Get(":runId/report")
  getReport(@Param("runId") runId: string): Promise<unknown> {
    return this.productService.getReport(runId);
  }

  @Put(":runId/decision")
  saveDecision(
    @Param("runId") runId: string,
    @Body() dto: SaveDecisionDto,
  ): Promise<unknown> {
    return this.productService.saveDecision(runId, dto);
  }
}
