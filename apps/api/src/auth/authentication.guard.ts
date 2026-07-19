import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Reflector } from "@nestjs/core";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { AuthenticationService } from "./authentication.service.js";
import { IS_PUBLIC_ROUTE, type IdentityRequest } from "./auth.constants.js";

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<IdentityRequest>();
    request.relayIdentity = await this.authentication.authenticate(
      request as never,
    );
    return true;
  }
}
