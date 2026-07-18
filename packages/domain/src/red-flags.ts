import type { Quote } from "@relay/contracts";

export type QuoteRedFlagCode =
  | "excluded_required_fee"
  | "expired_quote"
  | "incomplete_pricing"
  | "low_confidence"
  | "missing_evidence"
  | "missing_expected_fee"
  | "non_binding_estimate"
  | "suspiciously_low_total"
  | "undisclosed_fee"
  | "unknown_fee_amount"
  | "wide_price_range"
  | "withdrawn_quote";

export type QuoteRedFlagSeverity = "low" | "medium" | "high";

export interface QuoteRedFlag {
  readonly code: QuoteRedFlagCode;
  readonly details: readonly string[];
  readonly message: string;
  readonly penalty: number;
  readonly severity: QuoteRedFlagSeverity;
}

export interface QuoteRedFlagOptions {
  /** Fee codes expected for the confirmed job specification. */
  readonly expectedFeeCodes?: readonly string[];
  /** Explicit evaluation time keeps expiration checks deterministic. */
  readonly referenceTime?: string;
  readonly marketMedianAmountMinor?: number;
  readonly maxRangeSpreadRatio?: number;
  readonly minimumConfidence?: number;
  readonly requireEvidence?: boolean;
  readonly suspiciousLowRatio?: number;
}

const DEFAULT_MINIMUM_CONFIDENCE = 0.65;
const DEFAULT_SUSPICIOUS_LOW_RATIO = 0.7;
const DEFAULT_MAX_RANGE_SPREAD_RATIO = 0.25;

function createFlag(
  code: QuoteRedFlagCode,
  severity: QuoteRedFlagSeverity,
  penalty: number,
  message: string,
  details: readonly string[] = [],
): QuoteRedFlag {
  return { code, details, message, penalty, severity };
}

function assertRatio(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

export function detectQuoteRedFlags(
  quote: Quote,
  options: QuoteRedFlagOptions = {},
): readonly QuoteRedFlag[] {
  const minimumConfidence =
    options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;
  const suspiciousLowRatio =
    options.suspiciousLowRatio ?? DEFAULT_SUSPICIOUS_LOW_RATIO;
  const maxRangeSpreadRatio =
    options.maxRangeSpreadRatio ?? DEFAULT_MAX_RANGE_SPREAD_RATIO;

  assertRatio("minimumConfidence", minimumConfidence);
  assertRatio("suspiciousLowRatio", suspiciousLowRatio);

  if (!Number.isFinite(maxRangeSpreadRatio) || maxRangeSpreadRatio < 0) {
    throw new RangeError("maxRangeSpreadRatio must be a non-negative number");
  }

  const flags: QuoteRedFlag[] = [];

  if (quote.status === "withdrawn") {
    flags.push(
      createFlag(
        "withdrawn_quote",
        "high",
        100,
        "The business withdrew this quote.",
      ),
    );
  }

  if (quote.confidence < minimumConfidence) {
    flags.push(
      createFlag(
        "low_confidence",
        "medium",
        12,
        "The extracted quote has low confidence.",
      ),
    );
  }

  if (quote.estimateType === "non_binding") {
    flags.push(
      createFlag(
        "non_binding_estimate",
        "medium",
        10,
        "The price is a non-binding estimate and may change.",
      ),
    );
  }

  const unknownFeeLabels = quote.fees
    .filter((fee) => fee.amount === null)
    .map((fee) => fee.label);

  if (unknownFeeLabels.length > 0) {
    flags.push(
      createFlag(
        "unknown_fee_amount",
        "high",
        18,
        "One or more fee amounts are unknown.",
        unknownFeeLabels,
      ),
    );
  }

  const undisclosedFeeLabels = quote.fees
    .filter((fee) => !fee.disclosed)
    .map((fee) => fee.label);

  if (undisclosedFeeLabels.length > 0) {
    flags.push(
      createFlag(
        "undisclosed_fee",
        "high",
        20,
        "The quote contains fees that were not clearly disclosed.",
        undisclosedFeeLabels,
      ),
    );
  }

  const excludedRequiredFeeLabels = quote.fees
    .filter((fee) => fee.required && !fee.includedInTotal)
    .map((fee) => fee.label);

  if (excludedRequiredFeeLabels.length > 0) {
    flags.push(
      createFlag(
        "excluded_required_fee",
        "high",
        20,
        "Required fees are excluded from the quoted total.",
        excludedRequiredFeeLabels,
      ),
    );
  }

  const presentFeeCodes = new Set(quote.fees.map((fee) => fee.code));
  const missingExpectedFeeCodes = (options.expectedFeeCodes ?? []).filter(
    (code) => !presentFeeCodes.has(code),
  );

  if (missingExpectedFeeCodes.length > 0) {
    flags.push(
      createFlag(
        "missing_expected_fee",
        "medium",
        12,
        "Expected job-related fees are missing from the quote.",
        missingExpectedFeeCodes,
      ),
    );
  }

  if (
    options.marketMedianAmountMinor !== undefined &&
    quote.totalPrice.amountMinor <
      options.marketMedianAmountMinor * suspiciousLowRatio
  ) {
    flags.push(
      createFlag(
        "suspiciously_low_total",
        "high",
        25,
        "The total is unusually low compared with the supplied market median.",
      ),
    );
  }

  if (
    quote.pricingModel === "hourly" &&
    (quote.hourlyRate === undefined || quote.estimatedHours === undefined)
  ) {
    flags.push(
      createFlag(
        "incomplete_pricing",
        "high",
        18,
        "The hourly quote is missing its rate or estimated hours.",
      ),
    );
  }

  if (quote.pricingModel === "range" && quote.priceRange === undefined) {
    flags.push(
      createFlag(
        "incomplete_pricing",
        "high",
        18,
        "The range quote does not include minimum and maximum prices.",
      ),
    );
  }

  if (quote.priceRange !== undefined) {
    const { maximum, minimum } = quote.priceRange;
    const spreadRatio =
      minimum.amountMinor === 0
        ? Number.POSITIVE_INFINITY
        : (maximum.amountMinor - minimum.amountMinor) / minimum.amountMinor;

    if (spreadRatio > maxRangeSpreadRatio) {
      flags.push(
        createFlag(
          "wide_price_range",
          "medium",
          10,
          "The quoted price range is unusually wide.",
        ),
      );
    }
  }

  if (options.requireEvidence === true && quote.evidence === undefined) {
    flags.push(
      createFlag(
        "missing_evidence",
        "medium",
        10,
        "The quote has no transcript or written evidence attached.",
      ),
    );
  }

  if (options.referenceTime !== undefined && quote.validUntil !== undefined) {
    const referenceTimestamp = Date.parse(options.referenceTime);

    if (Number.isNaN(referenceTimestamp)) {
      throw new RangeError("referenceTime must be an ISO date-time string");
    }

    if (Date.parse(quote.validUntil) < referenceTimestamp) {
      flags.push(
        createFlag("expired_quote", "high", 100, "The quote has expired."),
      );
    }
  }

  return flags;
}
