import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthenticationGuard } from "./authentication.guard.js";
import { AuthenticationService } from "./authentication.service.js";
import { CurrentIdentityService } from "./current-identity.service.js";

@Global()
@Module({
  exports: [CurrentIdentityService],
  providers: [
    AuthenticationService,
    CurrentIdentityService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
  ],
})
export class AuthModule {}
