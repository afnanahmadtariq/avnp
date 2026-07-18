import "reflect-metadata";

import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it } from "vitest";

import { WorkerRuntimeService } from "./worker-runtime.service.js";
import { WorkerModule } from "./worker.module.js";

describe("WorkerModule", () => {
  let app: INestApplicationContext | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("becomes ready without provider credentials or outbound work", async () => {
    app = await NestFactory.createApplicationContext(WorkerModule, {
      logger: false,
    });

    expect(app.get(WorkerRuntimeService).isReady()).toBe(true);
  });
});
