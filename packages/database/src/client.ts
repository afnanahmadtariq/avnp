import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export interface DatabaseClientOptions {
  readonly connectionString: string;
}

/**
 * Creates an explicit Prisma 7 client. The caller owns connection lifecycle and
 * must call `$disconnect()` during application shutdown.
 */
export function createPrismaClient(
  options: DatabaseClientOptions,
): PrismaClient {
  const connectionString = options.connectionString.trim();

  if (connectionString.length === 0) {
    throw new Error("A non-empty PostgreSQL connection string is required.");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

export type DatabaseClient = ReturnType<typeof createPrismaClient>;
