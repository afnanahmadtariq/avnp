import { Module } from "@nestjs/common";

import { ProviderCompositionModule } from "../providers/provider-composition.module.js";
import { AccountController } from "./account.controller.js";
import { IntakeController } from "./intake.controller.js";
import { IntakeService } from "./intake.service.js";
import { JobsController } from "./jobs.controller.js";
import { ProductService } from "./product.service.js";
import { RunsController } from "./runs.controller.js";

@Module({
  controllers: [
    JobsController,
    IntakeController,
    RunsController,
    AccountController,
  ],
  imports: [ProviderCompositionModule],
  providers: [IntakeService, ProductService],
})
export class ProductModule {}
