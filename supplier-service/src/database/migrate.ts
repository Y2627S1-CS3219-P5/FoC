/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-25.
 * Scope: added a deterministic versioned-migration runner for local and container startup.
 * Author review: Reviewed and approved by @ron.
 * Additional AI assistance: OpenAI Codex (GPT-6), 2026-10-18. Scope: used the
 * discrete verified-TLS cloud connection and runtime grant seam for issue #48.
 * Author review: PENDING.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Pool } from "pg";

import {
  getDatabaseConfig,
  getRuntimeDatabaseRole,
} from "../config/environment";
import { withDatabaseConnection } from "./connection";

export async function runMigrations(): Promise<void> {
  await withDatabaseConnection(
    getDatabaseConfig(),
    async ({ database, pool }) => {
      const migrationsFolder = path.resolve(
        process.cwd(),
        process.env.MIGRATIONS_PATH ?? "drizzle",
      );
      await migrate(database, { migrationsFolder });

      const runtimeRole = getRuntimeDatabaseRole();
      if (runtimeRole) {
        await grantRuntimePrivileges(pool, runtimeRole);
      }
    },
  );
}

export async function grantRuntimePrivileges(
  pool: Pool,
  runtimeRole: string,
): Promise<void> {
  const role = `"${runtimeRole}"`;

  await pool.query(
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${role}`,
  );
  await pool.query(
    `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${role}`,
  );
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE ON TABLE public.suppliers TO ${role}`,
  );
  await pool.query(
    `GRANT SELECT, INSERT, DELETE ON TABLE public.supplier_categories TO ${role}`,
  );
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role}`,
  );
  await pool.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role}`,
  );
}

if (require.main === module) {
  void runMigrations()
    .then(() => console.info("Supplier database migrations completed."))
    .catch((error: unknown) => {
      console.error("Supplier database migration failed.", error);
      process.exitCode = 1;
    });
}
