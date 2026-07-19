import { Module } from "@nestjs/common";

import { ProviderCompositionModule } from "../providers/provider-composition.module.js";
import { AccountController } from "./account.controller.js";
import { EvidenceAccessService } from "./evidence-access.service.js";
import { EvidenceController } from "./evidence.controller.js";
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
    EvidenceController,
  ],
  imports: [ProviderCompositionModule],
  providers: [EvidenceAccessService, IntakeService, ProductService],
})
export class ProductModule {}
