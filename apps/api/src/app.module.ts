import { Module } from "@nestjs/common";

import { RuntimeConfigModule } from "./config/runtime-config.module.js";
import { HealthController } from "./health.controller.js";
import { ProductModule } from "./product/product.module.js";
import { RootController } from "./root.controller.js";

@Module({
  controllers: [RootController, HealthController],
  imports: [RuntimeConfigModule, ProductModule],
})
export class AppModule {}
