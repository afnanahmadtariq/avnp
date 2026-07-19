import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { createPrismaClient, type DatabaseClient } from "@relay/database";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private databaseClient: DatabaseClient | undefined;

  get configured(): boolean {
    return this.databaseClient !== undefined;
  }

  get client(): DatabaseClient {
    if (!this.databaseClient) {
      throw new ServiceUnavailableException(
        "Product data is unavailable because DATABASE_URL is not configured.",
      );
    }

    return this.databaseClient;
  }

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
      this.logger.warn(
        "DATABASE_URL is not configured; health endpoints remain available but product routes return 503",
      );
      return;
    }

    this.databaseClient = createPrismaClient({ connectionString });
    await this.databaseClient.$connect();
    this.logger.log("PostgreSQL connection is ready");
  }

  async onModuleDestroy(): Promise<void> {
    await this.databaseClient?.$disconnect();
    this.databaseClient = undefined;
  }
}
