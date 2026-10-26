import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../generated/prisma/client.js";

export function createPrismaClient(
  connectionString = process.env["DATABASE_URL"],
): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL no está definida");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

export type DatabaseClient = PrismaClient;
export type DatabaseTransaction = Prisma.TransactionClient;
