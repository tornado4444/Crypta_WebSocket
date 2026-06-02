import { PrismaClient } from "@prisma/client";

import { logger } from "./logger";

let prismaClient: PrismaClient | null = null;
let warnedMissingDatabaseUrl = false;

export function getPrismaClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    if (!warnedMissingDatabaseUrl) {
      logger.warn("[db] DATABASE_URL is not configured. PostgreSQL persistence is disabled.");
      warnedMissingDatabaseUrl = true;
    }

    return null;
  }

  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

export async function disconnectPrisma(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = null;
}
