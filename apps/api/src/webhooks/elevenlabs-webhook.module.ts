import { Module } from "@nestjs/common";

import { ProviderCompositionModule } from "../providers/provider-composition.module.js";
import { ElevenLabsWebhookController } from "./elevenlabs-webhook.controller.js";
import { ElevenLabsWebhookService } from "./elevenlabs-webhook.service.js";

/**
 * PrismaService must be exported by the application's shared database module.
 * Keeping it out of this module prevents a second database client lifecycle.
 */
@Module({
  controllers: [ElevenLabsWebhookController],
  imports: [ProviderCompositionModule],
  providers: [ElevenLabsWebhookService],
})
export class ElevenLabsWebhookModule {}
