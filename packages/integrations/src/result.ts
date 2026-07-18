export type ProviderErrorCode =
  | "authentication"
  | "conflict"
  | "invalid-response"
  | "misconfigured"
  | "not-found"
  | "rate-limited"
  | "timeout"
  | "unavailable"
  | "unknown";

export interface ProviderFailure {
  readonly code: ProviderErrorCode;
  readonly message: string;
  /** Safe to log; never place credentials or raw personal data here. */
  readonly metadata?: Readonly<Record<string, boolean | number | string>>;
  readonly provider: string;
  readonly retryable: boolean;
}

export type ProviderResult<Value> =
  | {
      readonly ok: false;
      readonly error: ProviderFailure;
    }
  | {
      readonly ok: true;
      readonly value: Value;
    };

export interface ProviderRequestContext {
  readonly deadlineAt?: string;
  readonly requestId: string;
  readonly signal?: AbortSignal;
  readonly traceId: string;
}
