import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createClerkClient, type ClerkClient } from "@clerk/backend";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RuntimeConfigService } from "../config/runtime-config.service.js";
import { LOCAL_RELAY_IDENTITY, type RelayIdentity } from "./auth.constants.js";

interface HttpRequestShape {
  readonly headers: Readonly<
    Record<string, readonly string[] | string | undefined>
  >;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly protocol?: string;
  readonly url?: string;
}

interface CachedClerkIdentity {
  readonly displayName?: string;
  readonly email?: string;
  readonly expiresAt: number;
}

const CLERK_IDENTITY_CACHE_MS = 60_000;

function header(
  headers: HttpRequestShape["headers"],
  name: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([candidate]) => candidate.toLowerCase() === name.toLowerCase(),
  )?.[1];
  const value = typeof match === "string" ? match : match?.[0];
  return value?.trim() || undefined;
}

function webRequest(request: HttpRequestShape): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(
      name,
      typeof value === "string"
        ? value
        : (value as readonly string[]).join(","),
    );
  }

  const forwardedProtocol = header(request.headers, "x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol ?? request.protocol ?? "https";
  const host =
    header(request.headers, "x-forwarded-host") ??
    header(request.headers, "host");
  if (!host) throw new UnauthorizedException("The request host is missing.");

  return new Request(
    `${protocol}://${host}${request.originalUrl ?? request.url ?? "/"}`,
    { headers, method: request.method ?? "GET" },
  );
}

function optionalClaim(
  claims: Readonly<Record<string, unknown>>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = claims[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().slice(0, 320);
    }
  }
  return undefined;
}

@Injectable()
export class AuthenticationService {
  private readonly clerk: ClerkClient | undefined;
  private readonly authorizedParties: readonly string[];
  private readonly identityCache = new Map<string, CachedClerkIdentity>();

  constructor(private readonly runtimeConfig: RuntimeConfigService) {
    const config = runtimeConfig.value;
    this.authorizedParties =
      config.api.corsOrigins === "*" ? [] : config.api.corsOrigins;
    if (config.auth.provider === "clerk") {
      if (!config.auth.clerkPublishableKey || !config.auth.clerkSecretKey) {
        throw new Error("Clerk authentication configuration is incomplete.");
      }
      this.clerk = createClerkClient({
        publishableKey: config.auth.clerkPublishableKey,
        secretKey: config.auth.clerkSecretKey,
      });
    }
  }

  async authenticate(request: HttpRequestShape): Promise<RelayIdentity> {
    if (this.runtimeConfig.value.auth.provider === "local") {
      return LOCAL_RELAY_IDENTITY;
    }
    if (!this.clerk) {
      throw new UnauthorizedException("Authentication is unavailable.");
    }

    try {
      const state = await this.clerk.authenticateRequest(webRequest(request), {
        acceptsToken: "session_token",
        authorizedParties: [...this.authorizedParties],
      });
      if (!state.isAuthenticated) {
        throw new UnauthorizedException("Sign in to continue.");
      }

      const auth = state.toAuth();
      const claims = auth.sessionClaims as Readonly<Record<string, unknown>>;
      let email = optionalClaim(claims, ["email", "email_address"]);
      let displayName = optionalClaim(claims, [
        "name",
        "full_name",
        "username",
      ]);
      if (email === undefined || displayName === undefined) {
        const clerkIdentity = await this.getClerkIdentity(auth.userId);
        email ??= clerkIdentity.email;
        displayName ??= clerkIdentity.displayName;
      }
      return {
        provider: "clerk",
        subject: auth.userId,
        ...(email === undefined ? {} : { email }),
        ...(displayName === undefined ? {} : { displayName }),
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("The session is invalid or expired.");
    }
  }

  private async getClerkIdentity(userId: string): Promise<CachedClerkIdentity> {
    const cached = this.identityCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached;

    if (!this.clerk) return { expiresAt: Date.now() };

    try {
      const user = await this.clerk.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress.trim() || undefined;
      const displayName =
        user.fullName?.trim() ||
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.username?.trim() ||
        undefined;
      const identity = {
        ...(displayName === undefined ? {} : { displayName }),
        ...(email === undefined ? {} : { email }),
        expiresAt: Date.now() + CLERK_IDENTITY_CACHE_MS,
      };
      this.identityCache.set(userId, identity);
      return identity;
    } catch {
      // A valid session may continue using already-persisted account details
      // during a transient Clerk Backend API outage.
      return { expiresAt: Date.now() };
    }
  }
}
