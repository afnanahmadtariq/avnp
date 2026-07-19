import {
  BullMqQueueProducer,
  type QueueEnvelopeProcessor,
  type QueueWorkerHost,
  type QueueWorkerObserver,
  createBullMqQueueWorkerHost,
} from "./bullmq.js";
import type { QueueRuntimeConfiguration } from "./configuration.js";
import { DisabledQueueProducer, type QueueProducer } from "./producer.js";

export async function createQueueProducer(
  configuration: QueueRuntimeConfiguration,
): Promise<QueueProducer> {
  if (!configuration.enabled) {
    return new DisabledQueueProducer(configuration.reason);
  }

  return BullMqQueueProducer.create(configuration);
}

export async function createQueueWorkerHost(
  configuration: QueueRuntimeConfiguration,
  processor: QueueEnvelopeProcessor,
  observer?: QueueWorkerObserver,
): Promise<QueueWorkerHost> {
  if (!configuration.enabled) {
    return {
      enabled: false,
      close: () => Promise.resolve(),
    };
  }

  return createBullMqQueueWorkerHost(configuration, processor, observer);
}
