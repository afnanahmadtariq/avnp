import { describe, expect, it } from "vitest";

import { QueueService } from "./queue.service.js";

describe("QueueService", () => {
  it("starts disabled in credential-free mode", async () => {
    const priorProvider = process.env.QUEUE_PROVIDER;
    process.env.QUEUE_PROVIDER = "memory";
    const service = new QueueService();

    try {
      await service.onModuleInit();
      expect(service.enabled).toBe(false);
    } finally {
      await service.onModuleDestroy();
      if (priorProvider === undefined) delete process.env.QUEUE_PROVIDER;
      else process.env.QUEUE_PROVIDER = priorProvider;
    }
  });
});
