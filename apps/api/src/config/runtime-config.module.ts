import { Global, Module } from "@nestjs/common";

import { RuntimeConfigService } from "./runtime-config.service.js";

@Global()
@Module({
  exports: [RuntimeConfigService],
  providers: [RuntimeConfigService],
})
export class RuntimeConfigModule {}
