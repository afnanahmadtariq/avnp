import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { RuntimeConfigModule } from "./config/runtime-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { ProductModule } from "./product/product.module.js";
import { QueueModule } from "./queue/queue.module.js";
import { RootController } from "./root.controller.js";
import { ElevenLabsWebhookModule } from "./webhooks/elevenlabs-webhook.module.js";

@Module({
  controllers: [RootController, HealthController],
  imports: [
    RuntimeConfigModule,
    AuthModule,
    DatabaseModule,
    QueueModule,
    ProductModule,
    ElevenLabsWebhookModule,
  ],
})
export class AppModule {}
