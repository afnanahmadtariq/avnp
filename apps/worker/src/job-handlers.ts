import {
  NonRetryableQueueError,
  queueJobNames,
  type AnyQueueJobEnvelope,
  type QueueJobEnvelope,
  type QueueJobName,
  type QueueProcessingContext,
} from "@relay/queue";

export const QUEUE_JOB_HANDLERS = Symbol("QUEUE_JOB_HANDLERS");

export type WorkerJobHandler<Name extends QueueJobName> = (
  envelope: QueueJobEnvelope<Name>,
  context: QueueProcessingContext,
) => Promise<void>;

export type WorkerJobHandlers = {
  readonly [Name in QueueJobName]: WorkerJobHandler<Name>;
};

/**
 * This registry is the worker's application boundary. Product orchestration
 * can replace individual handlers through Nest dependency injection without
 * coupling BullMQ or Redis to the domain implementation.
 */
export function createUnconfiguredJobHandlers(): WorkerJobHandlers {
  const unconfigured =
    <Name extends QueueJobName>(name: Name) =>
    async (
      envelope: QueueJobEnvelope<Name>,
      context: QueueProcessingContext,
    ): Promise<never> => {
      void envelope;
      void context;
      throw new NonRetryableQueueError(
        `No product orchestration handler is configured for ${name}`,
      );
    };

  return {
    [queueJobNames.continueNegotiation]: unconfigured(
      queueJobNames.continueNegotiation,
    ),
    [queueJobNames.discoverBusinesses]: unconfigured(
      queueJobNames.discoverBusinesses,
    ),
    [queueJobNames.normalizeQuote]: unconfigured(queueJobNames.normalizeQuote),
    [queueJobNames.placeCall]: unconfigured(queueJobNames.placeCall),
    [queueJobNames.processCallOutcome]: unconfigured(
      queueJobNames.processCallOutcome,
    ),
    [queueJobNames.rankQuotes]: unconfigured(queueJobNames.rankQuotes),
  };
}

export function dispatchQueueJob(
  handlers: WorkerJobHandlers,
  envelope: AnyQueueJobEnvelope,
  context: QueueProcessingContext,
): Promise<void> {
  switch (envelope.name) {
    case "business.discover":
      return handlers[envelope.name](envelope, context);
    case "call.outcome.process":
      return handlers[envelope.name](envelope, context);
    case "call.place":
      return handlers[envelope.name](envelope, context);
    case "negotiation.continue":
      return handlers[envelope.name](envelope, context);
    case "quote.normalize":
      return handlers[envelope.name](envelope, context);
    case "quote.rank":
      return handlers[envelope.name](envelope, context);
  }
}
