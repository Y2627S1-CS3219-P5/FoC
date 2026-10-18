/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: centralized creation and cleanup of Supplier PostgreSQL/Drizzle connections.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: accepted
 * verified-TLS Pool configuration for issue #48. Author review: PENDING.
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

export interface DatabaseConnection {
  pool: Pool;
  database: NodePgDatabase<typeof schema>;
}

export function createDatabaseConnection(
  config: PoolConfig,
): DatabaseConnection {
  const pool = new Pool(config);
  return {
    pool,
    database: drizzle(pool, { schema }),
  };
}

export async function withDatabaseConnection<T>(
  config: PoolConfig,
  operation: (connection: DatabaseConnection) => Promise<T>,
): Promise<T> {
  const connection = createDatabaseConnection(config);
  try {
    return await operation(connection);
  } finally {
    await connection.pool.end();
  }
}
