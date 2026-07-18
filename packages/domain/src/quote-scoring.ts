import type { Business, Quote } from "@relay/contracts";

import {
  detectQuoteRedFlags,
  type QuoteRedFlag,
  type QuoteRedFlagCode,
  type QuoteRedFlagOptions,
} from "./red-flags.js";

export interface QuoteCandidate {
  readonly business?: Pick<Business, "rating" | "reviewCount">;
  readonly quote: Quote;
}

export interface QuoteScoreWeights {
  readonly completeness: number;
  readonly confidence: number;
  readonly price: number;
  readonly reputation: number;
}

export interface QuotePriceBounds {
  readonly maximumAmountMinor: number;
  readonly minimumAmountMinor: number;
}

export interface QuoteScoringOptions extends QuoteRedFlagOptions {
  readonly priceBounds?: QuotePriceBounds;
  readonly weights?: Partial<QuoteScoreWeights>;
}

export interface QuoteScoreComponents {
  readonly completeness: number;
  readonly confidence: number;
  readonly price: number;
  readonly reputation: number;
}

export interface QuoteScore {
  readonly businessId: string;
  readonly components: QuoteScoreComponents;
  readonly eligible: boolean;
  readonly quoteId: string;
  readonly redFlags: readonly QuoteRedFlag[];
  readonly riskPenalty: number;
  readonly totalScore: number;
}

export interface RankedQuoteScore extends QuoteScore {
  readonly rank: number;
}

export const DEFAULT_QUOTE_SCORE_WEIGHTS = {
  completeness: 0.15,
  confidence: 0.2,
  price: 0.45,
  reputation: 0.2,
} as const satisfies QuoteScoreWeights;

const INELIGIBLE_FLAG_CODES = new Set<QuoteRedFlagCode>([
  "expired_quote",
  "withdrawn_quote",
]);

const COMPLETENESS_FLAG_CODES = new Set<QuoteRedFlagCode>([
  "excluded_required_fee",
  "incomplete_pricing",
  "missing_evidence",
  "missing_expected_fee",
  "non_binding_estimate",
  "undisclosed_fee",
  "unknown_fee_amount",
  "wide_price_range",
]);

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveWeights(
  overrides: Partial<QuoteScoreWeights> | undefined,
): QuoteScoreWeights {
  const weights: QuoteScoreWeights = {
    ...DEFAULT_QUOTE_SCORE_WEIGHTS,
    ...overrides,
  };
  const values = Object.values(weights);

  if (values.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError(
      "Quote score weights must be finite, non-negative numbers",
    );
  }

  const total = values.reduce((sum, weight) => sum + weight, 0);

  if (total === 0) {
    throw new RangeError(
      "At least one quote score weight must be greater than zero",
    );
  }

  return {
    completeness: weights.completeness / total,
    confidence: weights.confidence / total,
    price: weights.price / total,
    reputation: weights.reputation / total,
  };
}

function calculatePriceScore(
  amountMinor: number,
  bounds: QuotePriceBounds | undefined,
): number {
  if (bounds === undefined) {
    return 100;
  }

  const { maximumAmountMinor, minimumAmountMinor } = bounds;

  if (
    !Number.isSafeInteger(minimumAmountMinor) ||
    !Number.isSafeInteger(maximumAmountMinor) ||
    minimumAmountMinor < 0 ||
    maximumAmountMinor < minimumAmountMinor
  ) {
    throw new RangeError(
      "Price bounds must be ordered, non-negative safe integers",
    );
  }

  if (maximumAmountMinor === minimumAmountMinor) {
    return 100;
  }

  return clampScore(
    ((maximumAmountMinor - amountMinor) /
      (maximumAmountMinor - minimumAmountMinor)) *
      100,
  );
}

function calculateReputationScore(
  business: QuoteCandidate["business"],
): number {
  if (business?.rating === undefined) {
    return 50;
  }

  const rawRatingScore = (business.rating / 5) * 100;
  const reviewReliability =
    business.reviewCount === undefined
      ? 0.5
      : Math.min(1, business.reviewCount / 50);

  return clampScore(50 + (rawRatingScore - 50) * reviewReliability);
}

function calculateCompletenessScore(redFlags: readonly QuoteRedFlag[]): number {
  const penalty = redFlags
    .filter((flag) => COMPLETENESS_FLAG_CODES.has(flag.code))
    .reduce((sum, flag) => sum + flag.penalty, 0);

  return clampScore(100 - penalty);
}

export function scoreQuote(
  candidate: QuoteCandidate,
  options: QuoteScoringOptions = {},
): QuoteScore {
  const redFlags = detectQuoteRedFlags(candidate.quote, options);
  const weights = resolveWeights(options.weights);
  const components: QuoteScoreComponents = {
    completeness: roundScore(calculateCompletenessScore(redFlags)),
    confidence: roundScore(candidate.quote.confidence * 100),
    price: roundScore(
      calculatePriceScore(
        candidate.quote.totalPrice.amountMinor,
        options.priceBounds,
      ),
    ),
    reputation: roundScore(calculateReputationScore(candidate.business)),
  };
  const weightedScore =
    components.completeness * weights.completeness +
    components.confidence * weights.confidence +
    components.price * weights.price +
    components.reputation * weights.reputation;
  const riskPenalty = Math.min(
    45,
    redFlags.reduce((sum, flag) => sum + flag.penalty * 0.6, 0),
  );
  const eligible = !redFlags.some((flag) =>
    INELIGIBLE_FLAG_CODES.has(flag.code),
  );

  return {
    businessId: candidate.quote.businessId,
    components,
    eligible,
    quoteId: candidate.quote.id,
    redFlags,
    riskPenalty: roundScore(riskPenalty),
    totalScore: roundScore(clampScore(weightedScore - riskPenalty)),
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const upper = sorted[midpoint];

  if (upper === undefined) {
    throw new RangeError("Cannot calculate the median of an empty collection");
  }

  if (sorted.length % 2 === 1) {
    return upper;
  }

  const lower = sorted[midpoint - 1];

  if (lower === undefined) {
    throw new RangeError("Cannot calculate the median of an empty collection");
  }

  return (lower + upper) / 2;
}

export function rankQuotes(
  candidates: readonly QuoteCandidate[],
  options: QuoteScoringOptions = {},
): readonly RankedQuoteScore[] {
  if (candidates.length === 0) {
    return [];
  }

  const quoteIds = candidates.map((candidate) => candidate.quote.id);

  if (new Set(quoteIds).size !== quoteIds.length) {
    throw new RangeError("Quote IDs must be unique when ranking quotes");
  }

  const currencies = new Set(
    candidates.map((candidate) => candidate.quote.totalPrice.currency),
  );

  if (currencies.size !== 1) {
    throw new RangeError(
      "Quotes must use one currency before they can be ranked",
    );
  }

  const amounts = candidates.map(
    (candidate) => candidate.quote.totalPrice.amountMinor,
  );
  const priceBounds = options.priceBounds ?? {
    maximumAmountMinor: Math.max(...amounts),
    minimumAmountMinor: Math.min(...amounts),
  };
  const marketMedianAmountMinor =
    options.marketMedianAmountMinor ?? median(amounts);
  const amountByQuoteId = new Map(
    candidates.map((candidate) => [
      candidate.quote.id,
      candidate.quote.totalPrice.amountMinor,
    ]),
  );
  const scores = candidates.map((candidate) =>
    scoreQuote(candidate, {
      ...options,
      marketMedianAmountMinor,
      priceBounds,
    }),
  );

  scores.sort((left, right) => {
    if (left.eligible !== right.eligible) {
      return left.eligible ? -1 : 1;
    }

    if (left.totalScore !== right.totalScore) {
      return right.totalScore - left.totalScore;
    }

    const leftAmount = amountByQuoteId.get(left.quoteId) ?? Number.MAX_VALUE;
    const rightAmount = amountByQuoteId.get(right.quoteId) ?? Number.MAX_VALUE;

    if (leftAmount !== rightAmount) {
      return leftAmount - rightAmount;
    }

    return left.quoteId.localeCompare(right.quoteId);
  });

  return scores.map((score, index) => ({ ...score, rank: index + 1 }));
}

export function selectBestQuote(
  candidates: readonly QuoteCandidate[],
  options: QuoteScoringOptions = {},
): RankedQuoteScore | undefined {
  return rankQuotes(candidates, options)[0];
}
