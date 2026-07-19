import { createHash } from "node:crypto";

import type {
  EvidenceStorageProvider,
  StoredEvidence,
  StoreEvidenceRequest,
} from "./storage.js";
import {
  encodePath,
  fetchProvider,
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

const PROVIDER_NAME = "supabase-storage";

export interface SupabaseEvidenceStorageConfig {
  readonly bucket: string;
  readonly cacheControlSeconds?: number;
  readonly serviceRoleKey: string;
  readonly supabaseUrl: string;
}

export interface SupabaseEvidenceStorageDependencies {
  readonly clock?: ProviderClock;
  readonly fetch?: FetchLike;
}

function validateObjectKey(key: string): boolean {
  if (
    key.length === 0 ||
    key.length > 1_024 ||
    key.startsWith("/") ||
    key.endsWith("/") ||
    key.includes("\\") ||
    key.includes("\0")
  ) {
    return false;
  }

  return key.split("/").every((part) => part.length > 0 && part !== "..");
}

export class SupabaseEvidenceStorage implements EvidenceStorageProvider {
  readonly name = PROVIDER_NAME;

  readonly #bucket: string;
  readonly #cacheControlSeconds: number;
  readonly #clock: ProviderClock;
  readonly #fetch: FetchLike;
  readonly #serviceRoleKey: string;
  readonly #storageUrl: string;

  constructor(
    config: SupabaseEvidenceStorageConfig,
    dependencies: SupabaseEvidenceStorageDependencies = {},
  ) {
    this.#bucket = config.bucket.trim();
    this.#cacheControlSeconds = Math.max(
      0,
      Math.trunc(config.cacheControlSeconds ?? 3_600),
    );
    this.#serviceRoleKey = config.serviceRoleKey.trim();
    this.#storageUrl = `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1`;
    this.#fetch = dependencies.fetch ?? fetch;
    this.#clock = dependencies.clock ?? systemClock;
  }

  async delete(
    key: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<void>> {
    const configurationFailure = this.#validateConfiguration();
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    if (!validateObjectKey(key)) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Evidence object key is invalid.",
        false,
      );
    }

    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#storageUrl}/object/${encodeURIComponent(this.#bucket)}`,
      {
        body: JSON.stringify({ prefixes: [key] }),
        headers: this.#headers({ "Content-Type": "application/json" }),
        method: "DELETE",
        signal: requestSignal(context, this.#clock),
      },
    );
    return response.ok ? { ok: true, value: undefined } : response;
  }

  async getSignedReadUrl(
    request: { readonly expiresInSeconds: number; readonly key: string },
    context: ProviderRequestContext,
  ): Promise<ProviderResult<string>> {
    const configurationFailure = this.#validateConfiguration();
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    if (
      !validateObjectKey(request.key) ||
      !Number.isInteger(request.expiresInSeconds) ||
      request.expiresInSeconds < 1 ||
      request.expiresInSeconds > 604_800
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Signed evidence URL parameters are invalid.",
        false,
      );
    }

    const objectPath = `${encodeURIComponent(this.#bucket)}/${encodePath(request.key)}`;
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#storageUrl}/object/sign/${objectPath}`,
      {
        body: JSON.stringify({ expiresIn: request.expiresInSeconds }),
        headers: this.#headers({ "Content-Type": "application/json" }),
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
    if (!isRecord(decoded.value) || !isString(decoded.value.signedURL)) {
      return providerFailure(
        this.name,
        "invalid-response",
        "Supabase Storage returned an invalid signed URL payload.",
        false,
      );
    }

    const signedUrl = decoded.value.signedURL.startsWith("/")
      ? `${this.#storageUrl}${decoded.value.signedURL}`
      : decoded.value.signedURL;
    try {
      return { ok: true, value: new URL(signedUrl).toString() };
    } catch {
      return providerFailure(
        this.name,
        "invalid-response",
        "Supabase Storage returned a malformed signed URL.",
        false,
      );
    }
  }

  async put(
    request: StoreEvidenceRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<StoredEvidence>> {
    const configurationFailure = this.#validateConfiguration();
    if (configurationFailure !== undefined) {
      return configurationFailure;
    }
    if (!validateObjectKey(request.key)) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Evidence object key is invalid.",
        false,
      );
    }
    if (!Number.isFinite(Date.parse(request.retentionUntil))) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Evidence retention deadline must be an ISO date-time.",
        false,
      );
    }

    const metadata = Buffer.from(
      JSON.stringify({
        ...request.metadata,
        retention_until: request.retentionUntil,
      }),
      "utf8",
    ).toString("base64");
    const objectPath = `${encodeURIComponent(this.#bucket)}/${encodePath(request.key)}`;
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#storageUrl}/object/${objectPath}`,
      {
        body: request.body,
        headers: this.#headers({
          "Cache-Control": `max-age=${this.#cacheControlSeconds}`,
          "Content-Type": request.contentType,
          "x-metadata": metadata,
          "x-upsert": "false",
        }),
        method: "POST",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const etag =
      response.value.headers.get("etag") ??
      `sha256:${createHash("sha256").update(request.body).digest("hex")}`;
    return {
      ok: true,
      value: {
        contentLength: request.body.byteLength,
        contentType: request.contentType,
        etag,
        key: request.key,
      },
    };
  }

  #headers(
    additional: Readonly<Record<string, string>>,
  ): Record<string, string> {
    return {
      apikey: this.#serviceRoleKey,
      Authorization: `Bearer ${this.#serviceRoleKey}`,
      ...additional,
    };
  }

  #validateConfiguration(): ProviderResult<never> | undefined {
    if (
      this.#bucket.length === 0 ||
      this.#serviceRoleKey.length === 0 ||
      !URL.canParse(this.#storageUrl)
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Supabase evidence storage configuration is incomplete.",
        false,
      );
    }

    return undefined;
  }
}
