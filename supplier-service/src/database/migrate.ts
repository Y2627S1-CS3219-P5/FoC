/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added a deterministic versioned-migration runner for local and container startup.
 * Author review required before submission.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Pool } from "pg";

import { getDatabaseUrl } from "../config/environment";

export async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });

  try {
    const migrationsFolder = path.resolve(
      process.cwd(),
      process.env.MIGRATIONS_PATH ?? "drizzle",
    );
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void runMigrations()
    .then(() => console.info("Supplier database migrations completed."))
    .catch((error: unknown) => {
      console.error("Supplier database migration failed.", error);
      process.exitCode = 1;
    });
}
