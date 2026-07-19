import { Module } from "@nestjs/common";
import {
  createBullMqQueueWorkerHost,
  resolveQueueRuntimeConfiguration,
} from "@relay/queue";
import { loadRuntimeConfig } from "@relay/runtime-config";

import { QUEUE_JOB_HANDLERS, type WorkerJobHandlers } from "./job-handlers.js";
import { WorkerDatabaseService } from "./worker-database.service.js";
import { WorkerOrchestrationService } from "./worker-orchestration.service.js";
import {
  createWorkerProviderSet,
  type WorkerProviderSet,
} from "./worker-providers.js";
import { WorkerQueueProducerService } from "./worker-queue-producer.service.js";
import {
  QUEUE_RUNTIME_CONFIGURATION,
  QUEUE_WORKER_HOST_FACTORY,
  WorkerRuntimeService,
  type QueueWorkerHostFactory,
} from "./worker-runtime.service.js";
import {
  WORKER_PROVIDER_SET,
  WORKER_RUNTIME_CONFIG,
  type WorkerRuntimeConfig,
} from "./worker-tokens.js";

const queueWorkerHostFactory: QueueWorkerHostFactory = (
  configuration,
  processor,
  observer,
) => createBullMqQueueWorkerHost(configuration, processor, observer);

@Module({
  exports: [WorkerRuntimeService],
  providers: [
    {
      provide: WORKER_RUNTIME_CONFIG,
      useFactory: () => loadRuntimeConfig(process.env),
    },
    {
      provide: QUEUE_RUNTIME_CONFIGURATION,
      useFactory: () => resolveQueueRuntimeConfiguration(process.env),
    },
    {
      inject: [WORKER_RUNTIME_CONFIG],
      provide: WORKER_PROVIDER_SET,
      useFactory: (configuration: WorkerRuntimeConfig): WorkerProviderSet =>
        createWorkerProviderSet(configuration),
    },
    {
      provide: QUEUE_WORKER_HOST_FACTORY,
      useValue: queueWorkerHostFactory,
    },
    WorkerDatabaseService,
    WorkerQueueProducerService,
    WorkerOrchestrationService,
    {
      inject: [WorkerOrchestrationService],
      provide: QUEUE_JOB_HANDLERS,
      useFactory: (
        orchestration: WorkerOrchestrationService,
      ): WorkerJobHandlers => orchestration.createHandlers(),
    },
    WorkerRuntimeService,
  ],
})
export class WorkerModule {}
