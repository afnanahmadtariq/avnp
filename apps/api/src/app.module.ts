import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller.js";
import { ProductModule } from "./product/product.module.js";
import { RootController } from "./root.controller.js";

@Module({
  controllers: [RootController, HealthController],
  imports: [ProductModule],
})
export class AppModule {}
