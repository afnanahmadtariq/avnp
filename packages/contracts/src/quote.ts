import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema, moneySchema } from "./common.js";

export const quoteFeeCategorySchema = z.enum([
  "access",
  "administrative",
  "coverage",
  "labor",
  "materials",
  "special_handling",
  "tax",
  "transportation",
  "other",
]);

export const quoteFeeSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(200),
    category: quoteFeeCategorySchema,
    amount: moneySchema.nullable(),
    required: z.boolean(),
    includedInTotal: z.boolean(),
    disclosed: z.boolean(),
  })
  .strict();

export const quotePricingModelSchema = z.enum(["fixed", "hourly", "range"]);

export const quoteEstimateTypeSchema = z.enum(["binding", "non_binding"]);

export const quoteStatusSchema = z.enum([
  "initial",
  "negotiated",
  "final",
  "withdrawn",
]);

export const quotePriceRangeSchema = z
  .object({
    minimum: moneySchema,
    maximum: moneySchema,
  })
  .strict()
  .superRefine((range, context) => {
    if (range.minimum.currency !== range.maximum.currency) {
      context.addIssue({
        code: "custom",
        message: "Price range currencies must match",
        path: ["maximum", "currency"],
      });
    }

    if (range.maximum.amountMinor < range.minimum.amountMinor) {
      context.addIssue({
        code: "custom",
        message: "Maximum price must be greater than or equal to minimum price",
        path: ["maximum", "amountMinor"],
      });
    }
  });

export const quoteEvidenceSchema = z
  .object({
    source: z.enum(["phone_call", "written_quote", "manual"]),
    callId: entityIdSchema.optional(),
    transcriptKey: z.string().trim().min(1).max(1_024).optional(),
    recordingKey: z.string().trim().min(1).max(1_024).optional(),
    excerpt: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const quoteTermsSchema = z
  .object({
    deposit: moneySchema.optional(),
    cancellationPolicy: z.string().trim().min(1).max(2_000).optional(),
    insuranceIncluded: z.boolean().optional(),
    packingIncluded: z.boolean().optional(),
    additionalNotes: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .optional(),
  })
  .strict();

export const quoteSchema = z
  .object({
    id: entityIdSchema,
    jobId: entityIdSchema,
    businessId: entityIdSchema,
    status: quoteStatusSchema,
    pricingModel: quotePricingModelSchema,
    estimateType: quoteEstimateTypeSchema,
    totalPrice: moneySchema,
    basePrice: moneySchema.optional(),
    priceRange: quotePriceRangeSchema.optional(),
    hourlyRate: moneySchema.optional(),
    estimatedHours: z.number().positive().max(10_000).optional(),
    minimumHours: z.number().nonnegative().max(10_000).optional(),
    fees: z.array(quoteFeeSchema).max(200),
    discount: moneySchema.optional(),
    tax: moneySchema.optional(),
    confidence: z.number().min(0).max(1),
    terms: quoteTermsSchema.optional(),
    evidence: quoteEvidenceSchema.optional(),
    capturedAt: isoDateTimeSchema,
    validUntil: isoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((quote, context) => {
    const currency = quote.totalPrice.currency;

    if (quote.totalPrice.amountMinor === 0) {
      context.addIssue({
        code: "custom",
        message: "Total price must be greater than zero",
        path: ["totalPrice", "amountMinor"],
      });
    }

    const currencyValues: readonly {
      readonly amount: { readonly currency: string } | undefined;
      readonly path: readonly (number | string)[];
    }[] = [
      { amount: quote.basePrice, path: ["basePrice"] },
      { amount: quote.hourlyRate, path: ["hourlyRate"] },
      { amount: quote.discount, path: ["discount"] },
      { amount: quote.tax, path: ["tax"] },
      { amount: quote.terms?.deposit, path: ["terms", "deposit"] },
    ] as const;

    for (const { amount, path } of currencyValues) {
      if (amount !== undefined && amount.currency !== currency) {
        context.addIssue({
          code: "custom",
          message: "All quote amounts must use the total price currency",
          path: [...path],
        });
      }
    }

    for (const [index, fee] of quote.fees.entries()) {
      if (fee.amount !== null && fee.amount.currency !== currency) {
        context.addIssue({
          code: "custom",
          message: "All quote amounts must use the total price currency",
          path: ["fees", index, "amount", "currency"],
        });
      }
    }

    if (
      quote.priceRange !== undefined &&
      (quote.priceRange.minimum.currency !== currency ||
        quote.priceRange.maximum.currency !== currency)
    ) {
      context.addIssue({
        code: "custom",
        message: "Price range currency must match the total price currency",
        path: ["priceRange"],
      });
    }
  });

export type Quote = z.infer<typeof quoteSchema>;
export type QuoteEstimateType = z.infer<typeof quoteEstimateTypeSchema>;
export type QuoteEvidence = z.infer<typeof quoteEvidenceSchema>;
export type QuoteFee = z.infer<typeof quoteFeeSchema>;
export type QuoteFeeCategory = z.infer<typeof quoteFeeCategorySchema>;
export type QuotePriceRange = z.infer<typeof quotePriceRangeSchema>;
export type QuotePricingModel = z.infer<typeof quotePricingModelSchema>;
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export type QuoteTerms = z.infer<typeof quoteTermsSchema>;
