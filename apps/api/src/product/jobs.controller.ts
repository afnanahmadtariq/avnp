import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";

// Runtime imports are required for Nest's emitted validation and injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  ConfirmJobDto,
  CreateJobDto,
  CreateRunDto,
  UpdateDraftDto,
} from "./product.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service.js";

@Controller("jobs")
export class JobsController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  listJobs(): Promise<unknown> {
    return this.productService.listJobs();
  }

  @Post()
  createJob(@Body() dto: CreateJobDto): Promise<unknown> {
    return this.productService.createJob(dto);
  }

  @Get(":publicId")
  getJob(@Param("publicId") publicId: string): Promise<unknown> {
    return this.productService.getJob(publicId);
  }

  @Patch(":publicId/draft")
  updateDraft(
    @Param("publicId") publicId: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<unknown> {
    return this.productService.updateDraft(publicId, dto);
  }

  @Post(":publicId/confirm")
  @HttpCode(HttpStatus.OK)
  confirmJob(
    @Param("publicId") publicId: string,
    @Body() dto: ConfirmJobDto,
  ): Promise<unknown> {
    return this.productService.confirmJob(publicId, dto);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post(":publicId/discovery")
  discoverBusinesses(@Param("publicId") publicId: string): Promise<unknown> {
    return this.productService.discoverBusinesses(publicId);
  }

  @Get(":publicId/candidates")
  getCandidates(@Param("publicId") publicId: string): Promise<unknown> {
    return this.productService.getCandidates(publicId);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post(":publicId/runs")
  createRun(
    @Param("publicId") publicId: string,
    @Body() dto: CreateRunDto,
  ): Promise<unknown> {
    return this.productService.createRun(publicId, dto);
  }
}
