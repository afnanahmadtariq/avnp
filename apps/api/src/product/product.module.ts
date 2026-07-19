import { Module } from "@nestjs/common";

import { AccountController } from "./account.controller.js";
import { JobsController } from "./jobs.controller.js";
import { ProductService } from "./product.service.js";
import { RunsController } from "./runs.controller.js";

@Module({
  controllers: [JobsController, RunsController, AccountController],
  providers: [ProductService],
})
export class ProductModule {}
