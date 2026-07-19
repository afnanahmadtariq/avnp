import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from "@nestjs/common";
import { REQUEST } from "@nestjs/core";

import type { IdentityRequest, RelayIdentity } from "./auth.constants.js";

@Injectable({ scope: Scope.REQUEST })
export class CurrentIdentityService {
  constructor(@Inject(REQUEST) private readonly request: IdentityRequest) {}

  get identity(): RelayIdentity {
    if (!this.request.relayIdentity) {
      throw new UnauthorizedException("Sign in to continue.");
    }
    return this.request.relayIdentity;
  }
}
