export const IS_PUBLIC_ROUTE = "relay:public-route";

export const LOCAL_RELAY_IDENTITY = {
  displayName: "Relay Demo",
  email: "demo@relay.local",
  provider: "local",
  subject: "demo-user",
} as const satisfies RelayIdentity;

export interface RelayIdentity {
  readonly displayName?: string;
  readonly email?: string;
  readonly provider: "clerk" | "local";
  readonly subject: string;
}

export interface IdentityRequest {
  relayIdentity?: RelayIdentity;
}
