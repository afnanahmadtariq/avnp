import type {
  ProviderErrorCode,
  ProviderFailure,
  ProviderRequestContext,
  ProviderResult,
} from "./result.js";

export type FetchLike = (
  input: Request | string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderClock = () => Date;

export const systemClock: ProviderClock = () => new Date();

export function providerFailure(
  provider: string,
  code: ProviderErrorCode,
  message: string,
  retryable: boolean,
  metadata?: Readonly<Record<string, boolean | number | string>>,
): ProviderResult<never> {
  const error: ProviderFailure = {
    code,
    message,
    provider,
    retryable,
    ...(metadata === undefined ? {} : { metadata }),
  };

  return { error, ok: false };
}

export function failureForHttpStatus(
  provider: string,
  status: number,
): ProviderResult<never> {
  if (status === 401 || status === 403) {
    return providerFailure(
      provider,
      "authentication",
      `${provider} rejected its server credentials.`,
      false,
      { status },
    );
  }

  if (status === 404) {
    return providerFailure(
      provider,
      "not-found",
      `${provider} could not find the requested resource.`,
      false,
      { status },
    );
  }

  if (status === 409) {
    return providerFailure(
      provider,
      "conflict",
      `${provider} rejected a conflicting request.`,
      false,
      { status },
    );
  }

  if (status === 408 || status === 429) {
    return providerFailure(
      provider,
      status === 429 ? "rate-limited" : "timeout",
      `${provider} temporarily could not process the request.`,
      true,
      { status },
    );
  }

  if (status >= 500) {
    return providerFailure(
      provider,
      "unavailable",
      `${provider} is temporarily unavailable.`,
      true,
      { status },
    );
  }

  return providerFailure(
    provider,
    "invalid-response",
    `${provider} rejected the request.`,
    false,
    { status },
  );
}

export function requestSignal(
  context: ProviderRequestContext,
  clock: ProviderClock,
): AbortSignal | null {
  if (context.deadlineAt === undefined) {
    return context.signal ?? null;
  }

  const deadline = Date.parse(context.deadlineAt);
  if (!Number.isFinite(deadline)) {
    return context.signal ?? null;
  }

  const remainingMilliseconds = deadline - clock().getTime();
  const deadlineSignal =
    remainingMilliseconds <= 0
      ? AbortSignal.abort(
          new DOMException("Provider deadline elapsed", "TimeoutError"),
        )
      : AbortSignal.timeout(remainingMilliseconds);

  return context.signal === undefined
    ? deadlineSignal
    : AbortSignal.any([context.signal, deadlineSignal]);
}

export async function fetchProvider(
  provider: string,
  fetcher: FetchLike,
  input: Request | string | URL,
  init: RequestInit,
): Promise<ProviderResult<Response>> {
  try {
    const response = await fetcher(input, init);
    if (!response.ok) {
      return failureForHttpStatus(provider, response.status);
    }

    return { ok: true, value: response };
  } catch (error) {
    const aborted =
      init.signal?.aborted === true ||
      (error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError"));

    return providerFailure(
      provider,
      aborted ? "timeout" : "unavailable",
      aborted
        ? `${provider} request exceeded its deadline.`
        : `${provider} could not be reached.`,
      true,
    );
  }
}

export async function readJson(
  provider: string,
  response: Response,
): Promise<ProviderResult<unknown>> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return providerFailure(
      provider,
      "invalid-response",
      `${provider} returned malformed JSON.`,
      false,
      { status: response.status },
    );
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function encodePath(value: string): string {
  return value
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
