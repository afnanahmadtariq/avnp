import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "./prisma.service.js";

describe("PrismaService without database configuration", () => {
  let originalDatabaseUrl: string | undefined;

  beforeEach(() => {
    originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("keeps health routes bootable and fails product access explicitly", async () => {
    const prisma = new PrismaService();

    await prisma.onModuleInit();

    expect(prisma.configured).toBe(false);
    expect(() => prisma.client).toThrow(ServiceUnavailableException);

    await prisma.onModuleDestroy();
  });
});
