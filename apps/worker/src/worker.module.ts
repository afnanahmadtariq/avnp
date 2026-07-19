import { Module } from "@nestjs/common";
import {
  createBullMqQueueWorkerHost,
  resolveQueueRuntimeConfiguration,
} from "@relay/queue";

import {
  createUnconfiguredJobHandlers,
  QUEUE_JOB_HANDLERS,
} from "./job-handlers.js";
import {
  QUEUE_RUNTIME_CONFIGURATION,
  QUEUE_WORKER_HOST_FACTORY,
  WorkerRuntimeService,
  type QueueWorkerHostFactory,
} from "./worker-runtime.service.js";

const queueWorkerHostFactory: QueueWorkerHostFactory = (
  configuration,
  processor,
  observer,
) => createBullMqQueueWorkerHost(configuration, processor, observer);

@Module({
  exports: [WorkerRuntimeService],
  providers: [
    {
      provide: QUEUE_RUNTIME_CONFIGURATION,
      useFactory: () => resolveQueueRuntimeConfiguration(process.env),
    },
    {
      provide: QUEUE_JOB_HANDLERS,
      useFactory: createUnconfiguredJobHandlers,
    },
    {
      provide: QUEUE_WORKER_HOST_FACTORY,
      useValue: queueWorkerHostFactory,
    },
    WorkerRuntimeService,
  ],
})
export class WorkerModule {}
