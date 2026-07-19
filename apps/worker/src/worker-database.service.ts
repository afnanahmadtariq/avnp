import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type DatabaseClient } from "@relay/database";

import {
  WORKER_RUNTIME_CONFIG,
  type WorkerRuntimeConfig,
} from "./worker-tokens.js";

@Injectable()
export class WorkerDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerDatabaseService.name);
  private databaseClient: DatabaseClient | undefined;

  constructor(
    @Inject(WORKER_RUNTIME_CONFIG)
    private readonly configuration: WorkerRuntimeConfig,
  ) {}

  get configured(): boolean {
    return this.databaseClient !== undefined;
  }

  get client(): DatabaseClient {
    if (this.databaseClient === undefined) {
      throw new Error(
        "Worker data access is unavailable because DATABASE_URL is not configured.",
      );
    }

    return this.databaseClient;
  }

  async onModuleInit(): Promise<void> {
    const connectionString = this.configuration.databaseUrl;

    if (connectionString === undefined) {
      this.logger.warn(
        "DATABASE_URL is not configured; the fixture worker remains idle",
      );
      return;
    }

    this.databaseClient = createPrismaClient({ connectionString });
    await this.databaseClient.$connect();
    this.logger.log("Worker PostgreSQL connection is ready");
  }

  async onModuleDestroy(): Promise<void> {
    await this.databaseClient?.$disconnect();
    this.databaseClient = undefined;
  }
}
