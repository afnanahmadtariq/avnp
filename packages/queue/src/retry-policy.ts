import type { QueueJobName } from "./contracts.js";

export interface QueueRetryPolicy {
  readonly attempts: number;
  readonly backoff: {
    readonly delay: number;
    readonly jitter: number;
    readonly type: "exponential" | "fixed";
  };
}

export const queueRetryPolicies = {
  "business.discover": retryPolicy(5, 2_000),
  "call.cancel": retryPolicy(5, 2_000),
  // A negotiated provider call can run well beyond two minutes. Fixed polling
  // keeps the fallback alive for thirty minutes without exponential gaps;
  // signed provider webhooks still trigger immediate processing in parallel.
  "call.outcome.process": fixedRetryPolicy(181, 10_000),
  // Provider-side idempotency must use the envelope idempotency key because a
  // timeout can occur after a billable call has already been accepted.
  "call.place": retryPolicy(3, 5_000),
  "negotiation.continue": retryPolicy(3, 5_000),
  "quote.normalize": retryPolicy(5, 2_000),
  "quote.rank": retryPolicy(5, 2_000),
} as const satisfies Readonly<Record<QueueJobName, QueueRetryPolicy>>;

function retryPolicy(attempts: number, delay: number): QueueRetryPolicy {
  return {
    attempts,
    backoff: {
      delay,
      jitter: 0.2,
      type: "exponential",
    },
  };
}

function fixedRetryPolicy(attempts: number, delay: number): QueueRetryPolicy {
  return {
    attempts,
    // Polling windows are safety deadlines. Jitter may shorten every delay,
    // so fixed polling deliberately uses no jitter.
    backoff: { delay, jitter: 0, type: "fixed" },
  };
}
