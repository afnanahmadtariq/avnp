import { movingVertical } from "./moving.js";

import type { VerticalConfig } from "./types.js";

export { movingVertical } from "./moving.js";
export type {
  BenchmarkDefinition,
  BenchmarkUnit,
  FeeCategory,
  FeeDefinition,
  FeeUnit,
  IntakeFieldConstraints,
  IntakeFieldDefinition,
  IntakeFieldOption,
  IntakeValueType,
  RedFlagCondition,
  RedFlagRuleDefinition,
  VerticalConfig,
  VerticalNegotiationPolicy,
} from "./types.js";

export const verticals = {
  moving: movingVertical,
} as const satisfies Readonly<Record<string, VerticalConfig>>;

export type VerticalId = keyof typeof verticals;

export function getVerticalConfig(verticalId: VerticalId): VerticalConfig {
  return verticals[verticalId];
}
