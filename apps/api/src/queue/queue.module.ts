import { Global, Module } from "@nestjs/common";

import { OutboxDispatcherService } from "./outbox-dispatcher.service.js";
import { QueueService } from "./queue.service.js";

@Global()
@Module({
  exports: [OutboxDispatcherService, QueueService],
  providers: [OutboxDispatcherService, QueueService],
})
export class QueueModule {}
