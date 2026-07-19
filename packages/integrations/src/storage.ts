import type { ProviderRequestContext, ProviderResult } from "./result.js";

export type EvidenceContentType =
  | "application/json"
  | "application/pdf"
  | "audio/mpeg"
  | "audio/wav"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "text/plain";

export interface StoreEvidenceRequest {
  readonly body: Uint8Array;
  readonly contentType: EvidenceContentType;
  readonly key: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly retentionUntil: string;
}

export interface StoredEvidence {
  readonly contentLength: number;
  readonly contentType: EvidenceContentType;
  readonly etag: string;
  readonly key: string;
}

export interface EvidenceStorageProvider {
  readonly name: string;

  delete(
    key: string,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<void>>;

  getSignedReadUrl(
    request: {
      readonly expiresInSeconds: number;
      readonly key: string;
    },
    context: ProviderRequestContext,
  ): Promise<ProviderResult<string>>;

  put(
    request: StoreEvidenceRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<StoredEvidence>>;
}
