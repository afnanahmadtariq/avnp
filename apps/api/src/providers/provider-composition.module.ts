import { Module } from "@nestjs/common";

import { ProviderCompositionService } from "./provider-composition.service.js";

@Module({
  exports: [ProviderCompositionService],
  providers: [ProviderCompositionService],
})
export class ProviderCompositionModule {}
