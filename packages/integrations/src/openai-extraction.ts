import { quoteSchema } from "@relay/contracts";
import type {
  InventoryItem,
  Money,
  PackingPreference,
  QuoteFee,
  QuoteTerms,
} from "@relay/contracts";

import type {
  ExtractJobSpecificationRequest,
  ExtractQuoteRequest,
  ExtractionInput,
  JobSpecificationDraft,
  JobSpecificationExtraction,
  QuoteExtraction,
  StructuredExtractionProvider,
} from "./extraction.js";
import {
  fetchProvider,
  isFiniteNumber,
  isRecord,
  isString,
  providerFailure,
  readJson,
  requestSignal,
  systemClock,
  type FetchLike,
  type ProviderClock,
} from "./http.js";
import type { ProviderRequestContext, ProviderResult } from "./result.js";

const PROVIDER_NAME = "openai-responses";
const DEFAULT_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MAX_FILE_BYTES = 20 * 1_024 * 1_024;

const NULLABLE_STRING_SCHEMA = { type: ["string", "null"] } as const;
const NULLABLE_NUMBER_SCHEMA = { type: ["number", "null"] } as const;
const NULLABLE_INTEGER_SCHEMA = { type: ["integer", "null"] } as const;
const NULLABLE_BOOLEAN_SCHEMA = { type: ["boolean", "null"] } as const;
const MONEY_SCHEMA = {
  additionalProperties: false,
  properties: {
    amountMinor: { minimum: 0, type: "integer" },
    currency: { pattern: "^[A-Z]{3}$", type: "string" },
  },
  required: ["amountMinor", "currency"],
  type: "object",
} as const;
const NULLABLE_MONEY_SCHEMA = {
  anyOf: [MONEY_SCHEMA, { type: "null" }],
} as const;

const JOB_EXTRACTION_SCHEMA = {
  additionalProperties: false,
  properties: {
    confidence: { maximum: 1, minimum: 0, type: "number" },
    facts: {
      additionalProperties: false,
      properties: {
        bedrooms: NULLABLE_INTEGER_SCHEMA,
        dropoffAddress: NULLABLE_STRING_SCHEMA,
        dropoffStairs: NULLABLE_INTEGER_SCHEMA,
        hasElevator: NULLABLE_BOOLEAN_SCHEMA,
        inventory: {
          items: {
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              notes: NULLABLE_STRING_SCHEMA,
              quantity: { minimum: 1, type: "integer" },
              specialHandling: { type: "boolean" },
            },
            required: ["name", "quantity", "specialHandling", "notes"],
            type: "object",
          },
          type: "array",
        },
        movingDate: NULLABLE_STRING_SCHEMA,
        notes: NULLABLE_STRING_SCHEMA,
        packingPreference: {
          enum: ["none", "materials", "partial", "full", null],
        },
        pickupAddress: NULLABLE_STRING_SCHEMA,
        pickupStairs: NULLABLE_INTEGER_SCHEMA,
        specialItems: { items: { type: "string" }, type: "array" },
      },
      required: [
        "pickupAddress",
        "dropoffAddress",
        "movingDate",
        "bedrooms",
        "pickupStairs",
        "dropoffStairs",
        "hasElevator",
        "inventory",
        "specialItems",
        "packingPreference",
        "notes",
      ],
      type: "object",
    },
    sourceSummary: { type: "string" },
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: ["facts", "confidence", "warnings", "sourceSummary"],
  type: "object",
} as const;

const QUOTE_EXTRACTION_SCHEMA = {
  additionalProperties: false,
  properties: {
    basePrice: NULLABLE_MONEY_SCHEMA,
    completeness: { maximum: 1, minimum: 0, type: "number" },
    confidence: { maximum: 1, minimum: 0, type: "number" },
    discount: NULLABLE_MONEY_SCHEMA,
    estimatedHours: NULLABLE_NUMBER_SCHEMA,
    estimateType: { enum: ["binding", "non_binding"] },
    fees: {
      items: {
        additionalProperties: false,
        properties: {
          amount: NULLABLE_MONEY_SCHEMA,
          category: {
            enum: [
              "access",
              "administrative",
              "coverage",
              "labor",
              "materials",
              "special_handling",
              "tax",
              "transportation",
              "other",
            ],
          },
          code: { type: "string" },
          disclosed: { type: "boolean" },
          includedInTotal: { type: "boolean" },
          label: { type: "string" },
          required: { type: "boolean" },
        },
        required: [
          "code",
          "label",
          "category",
          "amount",
          "required",
          "includedInTotal",
          "disclosed",
        ],
        type: "object",
      },
      type: "array",
    },
    hourlyRate: NULLABLE_MONEY_SCHEMA,
    minimumHours: NULLABLE_NUMBER_SCHEMA,
    priceRange: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            maximum: MONEY_SCHEMA,
            minimum: MONEY_SCHEMA,
          },
          required: ["minimum", "maximum"],
          type: "object",
        },
        { type: "null" },
      ],
    },
    pricingModel: { enum: ["fixed", "hourly", "range"] },
    sourceSummary: { type: "string" },
    tax: NULLABLE_MONEY_SCHEMA,
    terms: {
      additionalProperties: false,
      properties: {
        additionalNotes: { items: { type: "string" }, type: "array" },
        cancellationPolicy: NULLABLE_STRING_SCHEMA,
        deposit: NULLABLE_MONEY_SCHEMA,
        insuranceIncluded: NULLABLE_BOOLEAN_SCHEMA,
        packingIncluded: NULLABLE_BOOLEAN_SCHEMA,
      },
      required: [
        "deposit",
        "cancellationPolicy",
        "insuranceIncluded",
        "packingIncluded",
        "additionalNotes",
      ],
      type: "object",
    },
    totalPrice: MONEY_SCHEMA,
    validUntil: NULLABLE_STRING_SCHEMA,
    warnings: { items: { type: "string" }, type: "array" },
  },
  required: [
    "pricingModel",
    "estimateType",
    "totalPrice",
    "basePrice",
    "priceRange",
    "hourlyRate",
    "estimatedHours",
    "minimumHours",
    "fees",
    "discount",
    "tax",
    "confidence",
    "completeness",
    "terms",
    "validUntil",
    "warnings",
    "sourceSummary",
  ],
  type: "object",
} as const;

export interface OpenAiExtractionConfig {
  readonly apiBaseUrl?: string;
  readonly apiKey: string;
  readonly maxFileBytes?: number;
  readonly maxOutputTokens?: number;
  readonly maxTextCharacters?: number;
  readonly model: string;
}

export interface OpenAiExtractionDependencies {
  readonly clock?: ProviderClock;
  readonly fetch?: FetchLike;
}

function strings(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || !value.every(isString)) {
    return undefined;
  }
  return value.map((item) => item.trim()).filter((item) => item.length > 0);
}

function confidence(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 && value <= 1 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const integer = nonNegativeInteger(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
}

function packingPreference(value: unknown): PackingPreference | undefined {
  return value === "none" ||
    value === "materials" ||
    value === "partial" ||
    value === "full"
    ? value
    : undefined;
}

function inventory(value: unknown): readonly InventoryItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items: InventoryItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !isString(entry.name)) {
      return undefined;
    }
    const quantity = positiveInteger(entry.quantity);
    if (quantity === undefined || typeof entry.specialHandling !== "boolean") {
      return undefined;
    }
    const notes =
      isString(entry.notes) && entry.notes.trim().length > 0
        ? entry.notes.trim()
        : undefined;
    items.push({
      name: entry.name.trim(),
      quantity,
      specialHandling: entry.specialHandling,
      ...(notes === undefined ? {} : { notes }),
    });
  }
  return items;
}

function toMoney(value: unknown): Money | undefined {
  if (!isRecord(value) || !isString(value.currency)) {
    return undefined;
  }
  const amountMinor = nonNegativeInteger(value.amountMinor);
  const currency = value.currency.trim();
  if (amountMinor === undefined || !/^[A-Z]{3}$/.test(currency)) {
    return undefined;
  }
  return { amountMinor, currency };
}

function toFees(value: unknown): readonly QuoteFee[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fees: QuoteFee[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      return undefined;
    }
    const amount = entry.amount === null ? null : toMoney(entry.amount);
    if (entry.amount !== null && amount === undefined) {
      return undefined;
    }
    const candidate = {
      code: entry.code,
      label: entry.label,
      category: entry.category,
      amount,
      required: entry.required,
      includedInTotal: entry.includedInTotal,
      disclosed: entry.disclosed,
    };
    const parsed = quoteSchema.shape.fees.element.safeParse(candidate);
    if (!parsed.success) {
      return undefined;
    }
    fees.push(parsed.data);
  }
  return fees;
}

function toTerms(value: unknown): QuoteTerms | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const deposit = value.deposit === null ? undefined : toMoney(value.deposit);
  if (value.deposit !== null && deposit === undefined) {
    return undefined;
  }
  const cancellationPolicy =
    isString(value.cancellationPolicy) &&
    value.cancellationPolicy.trim().length > 0
      ? value.cancellationPolicy.trim()
      : undefined;
  const additionalNotes = strings(value.additionalNotes);
  if (additionalNotes === undefined) {
    return undefined;
  }
  const insuranceIncluded =
    typeof value.insuranceIncluded === "boolean"
      ? value.insuranceIncluded
      : undefined;
  const packingIncluded =
    typeof value.packingIncluded === "boolean"
      ? value.packingIncluded
      : undefined;
  if (
    deposit === undefined &&
    cancellationPolicy === undefined &&
    insuranceIncluded === undefined &&
    packingIncluded === undefined &&
    additionalNotes.length === 0
  ) {
    return undefined;
  }

  return {
    ...(deposit === undefined ? {} : { deposit }),
    ...(cancellationPolicy === undefined ? {} : { cancellationPolicy }),
    ...(insuranceIncluded === undefined ? {} : { insuranceIncluded }),
    ...(packingIncluded === undefined ? {} : { packingIncluded }),
    ...(additionalNotes.length === 0
      ? {}
      : { additionalNotes: [...additionalNotes] }),
  };
}

function responseText(value: Record<string, unknown>): string | undefined {
  if (isString(value.output_text) && value.output_text.length > 0) {
    return value.output_text;
  }
  if (!Array.isArray(value.output)) {
    return undefined;
  }
  for (const output of value.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) {
      continue;
    }
    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        isString(content.text)
      ) {
        return content.text;
      }
    }
  }
  return undefined;
}

export class OpenAiResponsesExtractionProvider implements StructuredExtractionProvider {
  readonly name = PROVIDER_NAME;

  readonly #apiBaseUrl: string;
  readonly #apiKey: string;
  readonly #clock: ProviderClock;
  readonly #fetch: FetchLike;
  readonly #maxFileBytes: number;
  readonly #maxOutputTokens: number;
  readonly #maxTextCharacters: number;
  readonly #model: string;

  constructor(
    config: OpenAiExtractionConfig,
    dependencies: OpenAiExtractionDependencies = {},
  ) {
    this.#apiKey = config.apiKey.trim();
    this.#model = config.model.trim();
    this.#apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.#maxFileBytes = Math.max(
      1,
      Math.trunc(config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES),
    );
    this.#maxOutputTokens = Math.max(
      256,
      Math.trunc(config.maxOutputTokens ?? 4_096),
    );
    this.#maxTextCharacters = Math.max(
      1,
      Math.trunc(config.maxTextCharacters ?? 1_000_000),
    );
    this.#fetch = dependencies.fetch ?? fetch;
    this.#clock = dependencies.clock ?? systemClock;
  }

  async extractJobSpecification(
    request: ExtractJobSpecificationRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<JobSpecificationExtraction>> {
    const response = await this.#extract(
      request.input,
      context,
      "moving_job_specification",
      JOB_EXTRACTION_SCHEMA,
      "Extract only explicitly supported moving-job facts. Use null for unknown scalar values, never infer missing inventory or access details, and list uncertainties in warnings.",
    );
    if (!response.ok) {
      return response;
    }
    if (!isRecord(response.value) || !isRecord(response.value.facts)) {
      return this.#invalidExtraction("job specification");
    }

    const raw = response.value.facts;
    const extractedConfidence = confidence(response.value.confidence);
    const warnings = strings(response.value.warnings);
    const sourceSummary = response.value.sourceSummary;
    const extractedInventory = inventory(raw.inventory);
    const specialItems = strings(raw.specialItems);
    if (
      extractedConfidence === undefined ||
      warnings === undefined ||
      !isString(sourceSummary) ||
      sourceSummary.trim().length === 0 ||
      extractedInventory === undefined ||
      specialItems === undefined
    ) {
      return this.#invalidExtraction("job specification");
    }

    const pickupAddress = isString(raw.pickupAddress)
      ? raw.pickupAddress.trim()
      : undefined;
    const dropoffAddress = isString(raw.dropoffAddress)
      ? raw.dropoffAddress.trim()
      : undefined;
    const movingDate =
      isString(raw.movingDate) && /^\d{4}-\d{2}-\d{2}$/.test(raw.movingDate)
        ? raw.movingDate
        : undefined;
    const bedrooms = nonNegativeInteger(raw.bedrooms);
    const pickupStairs = nonNegativeInteger(raw.pickupStairs);
    const dropoffStairs = nonNegativeInteger(raw.dropoffStairs);
    const preference = packingPreference(raw.packingPreference);
    const notes =
      isString(raw.notes) && raw.notes.trim().length > 0
        ? raw.notes.trim()
        : undefined;
    const facts: JobSpecificationDraft = {
      vertical: "moving",
      ...(pickupAddress === undefined || pickupAddress.length === 0
        ? {}
        : { pickupAddress: { formattedAddress: pickupAddress } }),
      ...(dropoffAddress === undefined || dropoffAddress.length === 0
        ? {}
        : { dropoffAddress: { formattedAddress: dropoffAddress } }),
      ...(movingDate === undefined ? {} : { movingDate }),
      ...(bedrooms === undefined ? {} : { bedrooms }),
      ...(pickupStairs === undefined ? {} : { pickupStairs }),
      ...(dropoffStairs === undefined ? {} : { dropoffStairs }),
      ...(typeof raw.hasElevator === "boolean"
        ? { hasElevator: raw.hasElevator }
        : {}),
      ...(extractedInventory.length === 0
        ? {}
        : { inventory: extractedInventory }),
      ...(specialItems.length === 0 ? {} : { specialItems }),
      ...(preference === undefined ? {} : { packingPreference: preference }),
      ...(notes === undefined ? {} : { notes }),
    };

    return {
      ok: true,
      value: {
        confidence: extractedConfidence,
        facts,
        sourceSummary: sourceSummary.trim(),
        warnings,
      },
    };
  }

  async extractQuote(
    request: ExtractQuoteRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<QuoteExtraction>> {
    const response = await this.#extract(
      request.input,
      context,
      "moving_quote",
      QUOTE_EXTRACTION_SCHEMA,
      `Extract an itemized moving quote. Amounts must be integer minor units using ${request.defaultCurrency}. Preserve undisclosed or unknown fee amounts as null, never invent terms, and list every ambiguity in warnings.`,
    );
    if (!response.ok) {
      return response;
    }
    if (!isRecord(response.value)) {
      return this.#invalidExtraction("quote");
    }

    const totalPrice = toMoney(response.value.totalPrice);
    const basePrice =
      response.value.basePrice === null
        ? undefined
        : toMoney(response.value.basePrice);
    const hourlyRate =
      response.value.hourlyRate === null
        ? undefined
        : toMoney(response.value.hourlyRate);
    const discount =
      response.value.discount === null
        ? undefined
        : toMoney(response.value.discount);
    const tax =
      response.value.tax === null ? undefined : toMoney(response.value.tax);
    const fees = toFees(response.value.fees);
    const terms = toTerms(response.value.terms);
    const extractedConfidence = confidence(response.value.confidence);
    const completeness = confidence(response.value.completeness);
    const warnings = strings(response.value.warnings);
    const sourceSummary = response.value.sourceSummary;
    const priceRange = isRecord(response.value.priceRange)
      ? {
          minimum: toMoney(response.value.priceRange.minimum),
          maximum: toMoney(response.value.priceRange.maximum),
        }
      : undefined;
    if (
      totalPrice === undefined ||
      (response.value.basePrice !== null && basePrice === undefined) ||
      (response.value.hourlyRate !== null && hourlyRate === undefined) ||
      (response.value.discount !== null && discount === undefined) ||
      (response.value.tax !== null && tax === undefined) ||
      fees === undefined ||
      extractedConfidence === undefined ||
      completeness === undefined ||
      warnings === undefined ||
      !isString(sourceSummary) ||
      sourceSummary.trim().length === 0 ||
      totalPrice.currency !== request.defaultCurrency ||
      !isRecord(response.value.terms) ||
      (response.value.priceRange !== null && priceRange === undefined) ||
      (response.value.estimatedHours !== null &&
        !isFiniteNumber(response.value.estimatedHours)) ||
      (response.value.minimumHours !== null &&
        !isFiniteNumber(response.value.minimumHours)) ||
      (response.value.validUntil !== null &&
        (!isString(response.value.validUntil) ||
          !Number.isFinite(Date.parse(response.value.validUntil)))) ||
      (priceRange !== undefined &&
        (priceRange.minimum === undefined || priceRange.maximum === undefined))
    ) {
      return this.#invalidExtraction("quote");
    }

    const estimatedHours =
      response.value.estimatedHours === null
        ? undefined
        : response.value.estimatedHours;
    const minimumHours =
      response.value.minimumHours === null
        ? undefined
        : response.value.minimumHours;
    const validUntil =
      isString(response.value.validUntil) &&
      Number.isFinite(Date.parse(response.value.validUntil))
        ? response.value.validUntil
        : undefined;
    const candidate = {
      id: request.quoteId,
      jobId: request.jobId,
      businessId: request.businessId,
      status: request.status ?? "initial",
      pricingModel: response.value.pricingModel,
      estimateType: response.value.estimateType,
      totalPrice,
      fees: [...fees],
      confidence: extractedConfidence,
      completeness,
      capturedAt: request.capturedAt ?? this.#clock().toISOString(),
      ...(basePrice === undefined ? {} : { basePrice }),
      ...(priceRange === undefined
        ? {}
        : {
            priceRange: {
              minimum: priceRange.minimum as Money,
              maximum: priceRange.maximum as Money,
            },
          }),
      ...(hourlyRate === undefined ? {} : { hourlyRate }),
      ...(isFiniteNumber(estimatedHours) ? { estimatedHours } : {}),
      ...(isFiniteNumber(minimumHours) ? { minimumHours } : {}),
      ...(discount === undefined ? {} : { discount }),
      ...(tax === undefined ? {} : { tax }),
      ...(terms === undefined ? {} : { terms }),
      ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
      ...(validUntil === undefined ? {} : { validUntil }),
    };
    const parsed = quoteSchema.safeParse(candidate);
    if (!parsed.success) {
      return this.#invalidExtraction("quote");
    }

    return {
      ok: true,
      value: {
        quote: parsed.data,
        sourceSummary: sourceSummary.trim(),
        warnings,
      },
    };
  }

  async #extract(
    input: ExtractionInput,
    context: ProviderRequestContext,
    schemaName: string,
    schema: Readonly<Record<string, unknown>>,
    instruction: string,
  ): Promise<ProviderResult<unknown>> {
    const configurationFailure = this.#validateConfiguration();
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    const inputFailure = this.#validateInput(input);
    if (inputFailure !== undefined) {
      return inputFailure;
    }

    const sourceContent =
      input.kind === "text"
        ? [{ text: input.text, type: "input_text" }]
        : input.contentType.startsWith("image/")
          ? [
              {
                image_url: `data:${input.contentType};base64,${Buffer.from(input.body).toString("base64")}`,
                type: "input_image",
              },
            ]
          : [
              {
                file_data: `data:${input.contentType};base64,${Buffer.from(input.body).toString("base64")}`,
                filename: input.filename,
                type: "input_file",
              },
            ];
    const body = {
      input: [
        {
          content: [
            {
              text: "Read the supplied source and return the requested structured extraction.",
              type: "input_text",
            },
            ...sourceContent,
          ],
          role: "user",
        },
      ],
      instructions: instruction,
      max_output_tokens: this.#maxOutputTokens,
      metadata: {
        relay_request_id: context.requestId,
        relay_trace_id: context.traceId,
      },
      model: this.#model,
      store: false,
      text: {
        format: {
          name: schemaName,
          schema,
          strict: true,
          type: "json_schema",
        },
      },
    };
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#apiBaseUrl}/responses`,
      {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const decoded = await readJson(this.name, response.value);
    if (!decoded.ok) {
      return decoded;
    }
    if (!isRecord(decoded.value) || decoded.value.status !== "completed") {
      return providerFailure(
        this.name,
        "invalid-response",
        "OpenAI did not complete the structured extraction.",
        false,
      );
    }
    const output = responseText(decoded.value);
    if (output === undefined) {
      return providerFailure(
        this.name,
        "invalid-response",
        "OpenAI returned no structured extraction output.",
        false,
      );
    }
    try {
      return { ok: true, value: JSON.parse(output) as unknown };
    } catch {
      return providerFailure(
        this.name,
        "invalid-response",
        "OpenAI returned malformed structured extraction JSON.",
        false,
      );
    }
  }

  #invalidExtraction(subject: string): ProviderResult<never> {
    return providerFailure(
      this.name,
      "invalid-response",
      `OpenAI returned an invalid ${subject} extraction.`,
      false,
    );
  }

  #validateConfiguration(): ProviderResult<never> | undefined {
    if (
      this.#apiKey.length === 0 ||
      this.#model.length === 0 ||
      !URL.canParse(this.#apiBaseUrl)
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "OpenAI extraction configuration is incomplete.",
        false,
      );
    }
    return undefined;
  }

  #validateInput(input: ExtractionInput): ProviderResult<never> | undefined {
    if (input.kind === "text") {
      if (
        input.text.trim().length === 0 ||
        input.text.length > this.#maxTextCharacters
      ) {
        return providerFailure(
          this.name,
          "misconfigured",
          "Extraction text is empty or too large.",
          false,
        );
      }
      return undefined;
    }
    if (
      input.body.byteLength === 0 ||
      input.body.byteLength > this.#maxFileBytes ||
      input.filename.trim().length === 0
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Extraction file is empty, too large, or missing a filename.",
        false,
      );
    }
    return undefined;
  }
}
