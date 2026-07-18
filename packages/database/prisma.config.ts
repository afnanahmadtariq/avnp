import { defineConfig } from "prisma/config";

const validationOnlyUrl =
  "postgresql://relay:relay@127.0.0.1:5432/relay?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Prisma validate parses this URL but does not connect to the database.
    url: process.env.DATABASE_URL ?? validationOnlyUrl,
  },
});
