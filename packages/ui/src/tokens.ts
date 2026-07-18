/** Browser-safe Relay design tokens mirrored by `@relay/ui/styles.css`. */
export const relayTokens = {
  accent: "#3157f6",
  accentSoft: "#eef1ff",
  background: "#f5f4ef",
  brandMint: "#86e6b3",
  border: "#e5e3dc",
  borderStrong: "#d4d1c8",
  muted: "#666a73",
  radiusLarge: "24px",
  radiusMedium: "16px",
  radiusSmall: "10px",
  shadowCard: "0 1px 2px rgb(15 23 42 / 4%), 0 12px 38px rgb(15 23 42 / 5%)",
  success: "#16835c",
  successSoft: "#eaf9f1",
  surface: "#ffffff",
  text: "#101114",
  warning: "#b86c0d",
  warningSoft: "#fff6e4",
} as const;

export type RelayTokenName = keyof typeof relayTokens;
export type RelayTokenValue = (typeof relayTokens)[RelayTokenName];

export const relayCssVariables = {
  accent: "--relay-accent",
  accentSoft: "--relay-accent-soft",
  background: "--relay-bg",
  brandMint: "--relay-brand-mint",
  border: "--relay-border",
  borderStrong: "--relay-border-strong",
  muted: "--relay-muted",
  radiusLarge: "--relay-radius-lg",
  radiusMedium: "--relay-radius-md",
  radiusSmall: "--relay-radius-sm",
  shadowCard: "--relay-shadow-card",
  success: "--relay-success",
  successSoft: "--relay-success-soft",
  surface: "--relay-surface",
  text: "--relay-text",
  warning: "--relay-warning",
  warningSoft: "--relay-warning-soft",
} as const satisfies Readonly<Record<RelayTokenName, `--relay-${string}`>>;

export function relayTokenReference(
  token: RelayTokenName,
): `var(${(typeof relayCssVariables)[RelayTokenName]})` {
  return `var(${relayCssVariables[token]})`;
}
