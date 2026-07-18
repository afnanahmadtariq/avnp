export type IntakeValueType =
  | "address"
  | "boolean"
  | "choice"
  | "date"
  | "integer"
  | "inventory"
  | "money"
  | "string-list"
  | "text";

export interface IntakeFieldConstraints {
  readonly max?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly minLength?: number;
}

export interface IntakeFieldOption {
  readonly label: string;
  readonly value: string;
}

export interface IntakeFieldDefinition {
  readonly constraints?: IntakeFieldConstraints;
  readonly description?: string;
  readonly key: string;
  readonly label: string;
  readonly options?: readonly IntakeFieldOption[];
  readonly question: string;
  readonly required: boolean;
  readonly valueType: IntakeValueType;
}

export type FeeCategory =
  | "access"
  | "administrative"
  | "coverage"
  | "labor"
  | "materials"
  | "special_handling"
  | "transportation";

export type FeeUnit =
  "flat" | "hour" | "item" | "mile" | "percent" | "person-hour";

export interface FeeDefinition {
  readonly category: FeeCategory;
  readonly code: string;
  readonly description: string;
  readonly disclosureRequired: boolean;
  readonly label: string;
  readonly normallyApplies: "always" | "conditional" | "optional";
  readonly unit: FeeUnit;
}

export type BenchmarkUnit = "hours" | "percent" | "usd" | "usd-per-hour";

export interface BenchmarkDefinition {
  /** Demo guardrail only; production values require a reviewed regional source. */
  readonly context: string;
  readonly id: string;
  readonly label: string;
  readonly range: {
    readonly max: number;
    readonly min: number;
  };
  readonly reviewBeforeUse: true;
  readonly unit: BenchmarkUnit;
}

export type RedFlagCondition =
  | {
      readonly field: string;
      readonly kind: "missing-value";
    }
  | {
      readonly field: string;
      readonly kind: "number-above";
      readonly threshold: number;
    }
  | {
      readonly deviationPercent: number;
      readonly kind: "quote-outlier";
    }
  | {
      readonly kind: "undisclosed-fee";
    }
  | {
      readonly kind: "unverified-business";
      readonly verification: "insurance" | "license";
    };

export interface RedFlagRuleDefinition {
  readonly condition: RedFlagCondition;
  readonly id: string;
  readonly message: string;
  readonly severity: "high" | "low" | "medium";
}

export interface VerticalNegotiationPolicy {
  readonly allowedConcessions: readonly string[];
  readonly mayReferenceCompetitorQuoteOnlyWhenDocumented: true;
  readonly requiredEvidence: readonly string[];
  readonly truthfulnessRequired: true;
}

export interface VerticalConfig {
  readonly benchmarks: readonly BenchmarkDefinition[];
  readonly feeTaxonomy: readonly FeeDefinition[];
  readonly id: string;
  readonly intakeFields: readonly IntakeFieldDefinition[];
  readonly label: string;
  readonly negotiationPolicy: VerticalNegotiationPolicy;
  readonly redFlagRules: readonly RedFlagRuleDefinition[];
  readonly version: number;
}
