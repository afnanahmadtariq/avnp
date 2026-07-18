import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema, moneySchema } from "./common.js";

export const negotiationStrategySchema = z.enum([
  "price_match",
  "fee_removal",
  "discount_request",
  "bundle_offer",
  "promotion_request",
]);

export const negotiationStatusSchema = z.enum([
  "pending",
  "in_progress",
  "improved",
  "unchanged",
  "declined",
  "failed",
]);

export const negotiationEventSchema = z
  .object({
    at: isoDateTimeSchema,
    actor: z.enum(["agent", "business"]),
    action: z.enum([
      "initial_quote",
      "counter_offer",
      "fee_waived",
      "discount_added",
      "benefit_added",
      "quote_accepted",
      "ended",
    ]),
    strategy: negotiationStrategySchema.optional(),
    amountBefore: moneySchema.optional(),
    amountAfter: moneySchema.optional(),
    description: z.string().trim().min(1).max(1_000),
    evidenceExcerpt: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const negotiationSchema = z
  .object({
    id: entityIdSchema,
    jobId: entityIdSchema,
    businessId: entityIdSchema,
    callId: entityIdSchema,
    quoteId: entityIdSchema.optional(),
    status: negotiationStatusSchema,
    strategies: z.array(negotiationStrategySchema).min(1).max(20),
    priceBefore: moneySchema,
    priceAfter: moneySchema,
    savedAmount: moneySchema,
    addedBenefits: z.array(z.string().trim().min(1).max(500)).max(100),
    events: z.array(negotiationEventSchema).max(500),
    startedAt: isoDateTimeSchema,
    endedAt: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((negotiation, context) => {
    const currency = negotiation.priceBefore.currency;

    if (
      negotiation.priceAfter.currency !== currency ||
      negotiation.savedAmount.currency !== currency
    ) {
      context.addIssue({
        code: "custom",
        message: "Negotiation amounts must use one currency",
        path: ["savedAmount", "currency"],
      });
    }

    const expectedSavings = Math.max(
      0,
      negotiation.priceBefore.amountMinor - negotiation.priceAfter.amountMinor,
    );

    if (negotiation.savedAmount.amountMinor !== expectedSavings) {
      context.addIssue({
        code: "custom",
        message: "Saved amount must equal the non-negative price difference",
        path: ["savedAmount", "amountMinor"],
      });
    }

    if (
      negotiation.status !== "pending" &&
      negotiation.status !== "in_progress" &&
      negotiation.endedAt === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "A finished negotiation must include endedAt",
        path: ["endedAt"],
      });
    }
  });

export type Negotiation = z.infer<typeof negotiationSchema>;
export type NegotiationEvent = z.infer<typeof negotiationEventSchema>;
export type NegotiationStatus = z.infer<typeof negotiationStatusSchema>;
export type NegotiationStrategy = z.infer<typeof negotiationStrategySchema>;
