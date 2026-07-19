import type {
  Address,
  CurrencyCode,
  InventoryItem,
  PackingPreference,
  Quote,
  QuoteEvidence,
  QuoteStatus,
} from "@relay/contracts";

import type { ProviderRequestContext, ProviderResult } from "./result.js";

export type ExtractionFileContentType =
  "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export type ExtractionInput =
  | {
      readonly kind: "file";
      readonly body: Uint8Array;
      readonly contentType: ExtractionFileContentType;
      readonly filename: string;
    }
  | {
      readonly kind: "text";
      readonly text: string;
    };

export interface JobSpecificationDraft {
  readonly bedrooms?: number;
  readonly dropoffAddress?: Address;
  readonly dropoffStairs?: number;
  readonly hasElevator?: boolean;
  readonly inventory?: readonly InventoryItem[];
  readonly movingDate?: string;
  readonly notes?: string;
  readonly packingPreference?: PackingPreference;
  readonly pickupAddress?: Address;
  readonly pickupStairs?: number;
  readonly specialItems?: readonly string[];
  readonly vertical: "moving";
}

export interface ExtractJobSpecificationRequest {
  readonly input: ExtractionInput;
}

export interface JobSpecificationExtraction {
  readonly confidence: number;
  readonly facts: JobSpecificationDraft;
  readonly sourceSummary: string;
  readonly warnings: readonly string[];
}

export interface ExtractQuoteRequest {
  readonly businessId: string;
  readonly capturedAt?: string;
  readonly defaultCurrency: CurrencyCode;
  readonly evidence?: QuoteEvidence;
  readonly input: ExtractionInput;
  readonly jobId: string;
  readonly quoteId: string;
  readonly status?: QuoteStatus;
}

export interface QuoteExtraction {
  readonly quote: Quote;
  readonly sourceSummary: string;
  readonly warnings: readonly string[];
}

export interface StructuredExtractionProvider {
  readonly name: string;

  extractJobSpecification(
    request: ExtractJobSpecificationRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<JobSpecificationExtraction>>;

  extractQuote(
    request: ExtractQuoteRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<QuoteExtraction>>;
}
